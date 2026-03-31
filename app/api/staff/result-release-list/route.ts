import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: queueEntries, error: queueError } = await supabase
      .from('queue_entries')
      .select('id, queue_number, visit_id, patient_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (queueError) {
      throw queueError;
    }

    const visitIds = (queueEntries ?? []).map((entry) => entry.visit_id);
    const patientIds = (queueEntries ?? []).map((entry) => entry.patient_id);

    const [{ data: patients, error: patientError }, { data: labOrders, error: labOrderError }] =
      await Promise.all([
        supabase
          .from('patients')
          .select('id, first_name, middle_name, last_name, company')
          .in('id', patientIds.length > 0 ? patientIds : ['00000000-0000-0000-0000-000000000000']),
        supabase
          .from('lab_orders')
          .select('id, visit_id, order_number')
          .in('visit_id', visitIds.length > 0 ? visitIds : ['00000000-0000-0000-0000-000000000000']),
      ]);

    if (patientError) {
      throw patientError;
    }

    if (labOrderError) {
      throw labOrderError;
    }

    const labOrderIds = (labOrders ?? []).map((order) => order.id);

    const [
      { data: labOrderItems, error: itemsError },
      { data: machineImports, error: importsError },
      { data: reports, error: reportsError },
    ] =
      await Promise.all([
        supabase
          .from('lab_order_items')
          .select('id, lab_order_id, service_lane, test_name')
          .in('lab_order_id', labOrderIds.length > 0 ? labOrderIds : ['00000000-0000-0000-0000-000000000000']),
        supabase
          .from('machine_imports')
          .select('id, visit_id, lane')
          .in('visit_id', visitIds.length > 0 ? visitIds : ['00000000-0000-0000-0000-000000000000']),
        supabase
          .from('reports')
          .select('id, lab_order_id, status')
          .in('lab_order_id', labOrderIds.length > 0 ? labOrderIds : ['00000000-0000-0000-0000-000000000000']),
      ]);

    if (itemsError) {
      throw itemsError;
    }

    if (importsError) {
      throw importsError;
    }
    if (reportsError) {
      throw reportsError;
    }

    const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
    for (const item of labOrderItems ?? []) {
      const orderId = String(item.lab_order_id);
      const current = itemsByOrder.get(orderId) ?? [];
      current.push(item as Record<string, unknown>);
      itemsByOrder.set(orderId, current);
    }

    const ordersByVisit = new Map<string, Array<Record<string, unknown>>>();
    for (const order of labOrders ?? []) {
      const visitId = String(order.visit_id);
      const current = ordersByVisit.get(visitId) ?? [];
      current.push(order as Record<string, unknown>);
      ordersByVisit.set(visitId, current);
    }

    const importsByVisit = new Map<string, Array<Record<string, unknown>>>();
    for (const item of machineImports ?? []) {
      const visitId = String(item.visit_id);
      const current = importsByVisit.get(visitId) ?? [];
      current.push(item as Record<string, unknown>);
      importsByVisit.set(visitId, current);
    }

    const reportsByOrder = new Map<string, Array<Record<string, unknown>>>();
    for (const report of reports ?? []) {
      const orderId = String(report.lab_order_id);
      const current = reportsByOrder.get(orderId) ?? [];
      current.push(report as Record<string, unknown>);
      reportsByOrder.set(orderId, current);
    }

    const patientsById = new Map(
      (patients ?? []).map((patient) => [String(patient.id), patient as Record<string, unknown>])
    );

    const releaseItems = (queueEntries ?? [])
      .map((entry) => {
        const patient = patientsById.get(String(entry.patient_id));
        const orders = ordersByVisit.get(String(entry.visit_id)) ?? [];
        const imports = importsByVisit.get(String(entry.visit_id)) ?? [];
        const orderItems = orders.flatMap((order) => itemsByOrder.get(String(order.id)) ?? []);
        const reportRows = orders.flatMap((order) => reportsByOrder.get(String(order.id)) ?? []);
        const importedLanes = new Set(imports.map((item) => String(item.lane)));

        const hasImportedResults = imports.length > 0;
        const reportStatus =
          reportRows.length === 0
            ? hasImportedResults
              ? 'draft'
              : 'pending'
            : reportRows.every((report) => String(report.status) === 'released')
              ? 'released'
              : reportRows.some((report) => ['validated', 'released'].includes(String(report.status)))
                ? 'validated'
                : 'draft';

        return {
          queueId: String(entry.id),
          queueNumber: String(entry.queue_number),
          patientName: patient
            ? [
                patient.last_name,
                patient.first_name,
                patient.middle_name,
              ]
                .filter(Boolean)
                .join(', ')
                .replace(', ,', ',')
            : 'Unknown Patient',
          company: String(patient?.company ?? ''),
          date: formatDate(String(entry.created_at)),
          orderCount: orders.length,
          machineImportCount: imports.length,
          pendingLaneCount: orderItems.filter(
            (item) => !importedLanes.has(String(item.service_lane))
          ).length,
          ready: hasImportedResults,
          reportStatus,
        };
      })
      .filter((item) => item.orderCount > 0);

    return NextResponse.json({ releaseItems });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load release queue list.',
      },
      { status: 500 }
    );
  }
}
