import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

type LabOrderItemRow = {
  id: string;
  lab_order_id: string;
  service_lane: string;
  test_name: string;
  specimen_status: string;
  status: string;
  created_at: string;
};

function toUiLane(lane: string) {
  switch (lane) {
    case 'blood_test':
      return 'BLOOD TEST';
    case 'drug_test':
      return 'DRUG TEST';
    case 'xray':
      return 'XRAY';
    case 'ecg':
      return 'ECG';
    default:
      return lane.replaceAll('_', ' ').toUpperCase();
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireStaffContext(request);
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';

    const { data: itemRows, error: itemsError } = await context.supabase
      .from('lab_order_items')
      .select('id, lab_order_id, service_lane, test_name, specimen_status, status, created_at')
      .order('created_at', { ascending: false });

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    const items = (itemRows ?? []) as LabOrderItemRow[];
    const orderIds = Array.from(new Set(items.map((item) => item.lab_order_id).filter(Boolean)));

    const { data: orders, error: ordersError } =
      orderIds.length > 0
        ? await context.supabase
            .from('lab_orders')
            .select('id, order_number, visit_id, patient_id, status, created_at')
            .in('id', orderIds)
        : { data: [], error: null };

    if (ordersError) {
      throw new Error(ordersError.message);
    }

    const patientIds = Array.from(new Set((orders ?? []).map((order) => String(order.patient_id ?? '')).filter(Boolean)));
    const visitIds = Array.from(new Set((orders ?? []).map((order) => String(order.visit_id ?? '')).filter(Boolean)));

    const { data: patients, error: patientsError } =
      patientIds.length > 0
        ? await context.supabase
            .from('patients')
            .select('id, first_name, middle_name, last_name')
            .in('id', patientIds)
        : { data: [], error: null };

    if (patientsError) {
      throw new Error(patientsError.message);
    }

    const { data: queueEntries, error: queueError } =
      visitIds.length > 0
        ? await context.supabase
            .from('queue_entries')
            .select('id, visit_id, queue_number')
            .in('visit_id', visitIds)
        : { data: [], error: null };

    if (queueError) {
      throw new Error(queueError.message);
    }

    const itemIds = items.map((item) => item.id);
    const { data: imports, error: importsError } =
      itemIds.length > 0
        ? await context.supabase
            .from('machine_imports')
            .select('id, lab_order_item_id, created_at, imported_by')
            .in('lab_order_item_id', itemIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };

    if (importsError) {
      throw new Error(importsError.message);
    }

    const ordersById = new Map((orders ?? []).map((order) => [String(order.id), order]));
    const patientsById = new Map((patients ?? []).map((patient) => [String(patient.id), patient]));
    const queueByVisitId = new Map((queueEntries ?? []).map((entry) => [String(entry.visit_id), entry]));
    const latestImportByItemId = new Map<string, { id: string; created_at: string; imported_by: string | null }>();

    for (const machineImport of imports ?? []) {
      const itemId = String(machineImport.lab_order_item_id ?? '');
      if (itemId && !latestImportByItemId.has(itemId)) {
        latestImportByItemId.set(itemId, {
          id: String(machineImport.id),
          created_at: String(machineImport.created_at),
          imported_by: machineImport.imported_by ? String(machineImport.imported_by) : null,
        });
      }
    }

    const labOrders = items
      .map((item) => {
        const order = ordersById.get(item.lab_order_id);
        const patient = patientsById.get(String(order?.patient_id ?? ''));
        const queue = queueByVisitId.get(String(order?.visit_id ?? ''));
        const machineImport = latestImportByItemId.get(item.id);
        const patientName = [patient?.first_name, patient?.middle_name, patient?.last_name]
          .filter(Boolean)
          .join(' ');

        return {
          id: item.id,
          labOrderId: item.lab_order_id,
          orderNumber: String(order?.order_number ?? ''),
          queueId: queue ? String(queue.id) : '',
          queueNumber: queue ? String(queue.queue_number ?? '') : '',
          patientName,
          testName: item.test_name,
          lane: toUiLane(item.service_lane),
          status: item.status,
          specimenStatus: item.specimen_status,
          requestedAt: item.created_at,
          hasResult: Boolean(machineImport),
          resultUploadedAt: machineImport?.created_at ?? null,
        };
      })
      .filter((item) => {
        if (!search) {
          return true;
        }

        return [
          item.orderNumber,
          item.queueNumber,
          item.patientName,
          item.testName,
          item.lane,
          item.status,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);
      });

    return NextResponse.json({ labOrders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load lab orders.';
    const status = message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
