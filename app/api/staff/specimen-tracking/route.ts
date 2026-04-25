import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit-events';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { assertActionPermission, requireStaffContext } from '@/lib/supabase/admin-auth';

type LabOrderItemRow = {
  id: string;
  lab_order_id: string;
  test_name: string;
  service_lane: string;
  specimen_status: 'pending_collection' | 'collected' | 'processing' | 'completed' | 'rejected';
  specimen_id: string | null;
  sample_id: string | null;
  collected_at: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  recollection_requested: boolean;
  recollection_requested_at: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
};

function createSpecimenId(item: Pick<LabOrderItemRow, 'sample_id' | 'id'>) {
  if (item.sample_id?.trim()) {
    return item.sample_id.trim();
  }

  return `SP-${String(item.id).slice(0, 8).toUpperCase()}`;
}

async function loadSpecimenRows(search: string) {
  const supabase = getSupabaseAdminClient();
  const { data: itemRows, error: itemsError } = await supabase
    .from('lab_order_items')
    .select(`
      id,
      lab_order_id,
      test_name,
      service_lane,
      specimen_status,
      specimen_id,
      sample_id,
      collected_at,
      processing_started_at,
      completed_at,
      rejected_at,
      rejection_reason,
      recollection_requested,
      recollection_requested_at,
      last_scanned_at,
      created_at,
      updated_at
    `)
    .order('updated_at', { ascending: false });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const items = (itemRows ?? []) as LabOrderItemRow[];
  const labOrderIds = items.map((item) => item.lab_order_id);
  const { data: orders, error: ordersError } = await supabase
    .from('lab_orders')
    .select('id, order_number, patient_id, visit_id')
    .in('id', labOrderIds);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const patientIds = (orders ?? []).map((order) => String(order.patient_id ?? ''));
  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, first_name, middle_name, last_name')
    .in('id', patientIds);

  if (patientsError) {
    throw new Error(patientsError.message);
  }

  const ordersById = new Map((orders ?? []).map((order) => [String(order.id), order]));
  const patientsById = new Map((patients ?? []).map((patient) => [String(patient.id), patient]));
  const itemIds = items.map((item) => item.id);
  const { data: machineImports, error: importsError } =
    itemIds.length > 0
      ? await supabase
          .from('machine_imports')
          .select('id, lab_order_item_id, imported_by, created_at')
          .in('lab_order_item_id', itemIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };

  if (importsError) {
    throw new Error(importsError.message);
  }

  const latestImportByItemId = new Map<string, { imported_by: string | null; created_at: string }>();
  for (const machineImport of machineImports ?? []) {
    const itemId = String(machineImport.lab_order_item_id ?? '');
    if (itemId && !latestImportByItemId.has(itemId)) {
      latestImportByItemId.set(itemId, {
        imported_by: machineImport.imported_by ? String(machineImport.imported_by) : null,
        created_at: String(machineImport.created_at),
      });
    }
  }

  const staffIds = Array.from(
    new Set(
      Array.from(latestImportByItemId.values())
        .map((machineImport) => machineImport.imported_by)
        .filter(Boolean) as string[]
    )
  );
  const { data: staffProfiles, error: staffError } =
    staffIds.length > 0
      ? await supabase.from('staff_profiles').select('id, full_name').in('id', staffIds)
      : { data: [], error: null };

  if (staffError) {
    throw new Error(staffError.message);
  }

  const staffById = new Map((staffProfiles ?? []).map((staff) => [String(staff.id), String(staff.full_name ?? '')]));

  return items
    .map((item) => {
      const order = ordersById.get(item.lab_order_id);
      const patient = patientsById.get(String(order?.patient_id ?? ''));
      const patientName = [patient?.first_name, patient?.middle_name ?? '', patient?.last_name]
        .filter(Boolean)
        .join(' ');
      const specimenId = item.specimen_id?.trim() || createSpecimenId(item);
      const machineImport = latestImportByItemId.get(item.id);
      const testedBy = machineImport?.imported_by
        ? staffById.get(machineImport.imported_by) || 'Unknown staff'
        : '';

      return {
        id: item.id,
        labOrderId: item.lab_order_id,
        visitId: String(order?.visit_id ?? ''),
        patientId: String(order?.patient_id ?? ''),
        patientName,
        orderNumber: String(order?.order_number ?? ''),
        specimenId,
        testName: item.test_name,
        lane: String(item.service_lane ?? '').replaceAll('_', ' ').toUpperCase(),
        status: item.specimen_status,
        collectedAt: item.collected_at,
        processingStartedAt: item.processing_started_at,
        completedAt: item.completed_at,
        rejectedAt: item.rejected_at,
        rejectionReason: item.rejection_reason ?? '',
        recollectionRequested: item.recollection_requested,
        recollectionRequestedAt: item.recollection_requested_at,
        lastScannedAt: item.last_scanned_at,
        testedBy,
        testedAt: machineImport?.created_at ?? null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    })
    .filter((item) => {
      if (!search) {
        return true;
      }

      return [
        item.patientName,
        item.orderNumber,
        item.specimenId,
        item.testName,
        item.lane,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
}

export async function GET(request: Request) {
  try {
    await requireStaffContext(request);
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const specimens = await loadSpecimenRows(search);

    return NextResponse.json({
      specimens,
      counters: {
        pending: specimens.filter((item) => item.status === 'pending_collection').length,
        processing: specimens.filter((item) => item.status === 'processing').length,
        completed: specimens.filter((item) => item.status === 'completed').length,
        rejected: specimens.filter((item) => item.status === 'rejected').length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load specimen tracking.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertActionPermission(context, 'manage_specimens');

    const body = (await request.json()) as {
      action?: 'collect' | 'start_processing' | 'complete' | 'reject' | 'request_recollect' | 'scan';
      itemId?: string;
      specimenId?: string;
      reason?: string;
    };

    if (!body.action || (!body.itemId && !body.specimenId)) {
      return NextResponse.json({ error: 'Missing specimen action payload.' }, { status: 400 });
    }

    const { supabase, userId } = context;
    let query = supabase
      .from('lab_order_items')
      .select(
        'id, lab_order_id, specimen_status, specimen_id, sample_id, recollection_requested, service_lane, test_name'
      )
      .limit(1);
    query = body.itemId ? query.eq('id', body.itemId) : query.eq('specimen_id', body.specimenId ?? '');
    const { data: currentItem, error: itemError } = await query.maybeSingle();

    if (itemError || !currentItem) {
      return NextResponse.json({ error: 'Specimen record not found.' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const specimenId = String(currentItem.specimen_id ?? '').trim() || createSpecimenId(currentItem);
    const updatePayload: Record<string, unknown> = {
      specimen_id: specimenId,
      last_scanned_at: body.action === 'scan' ? now : now,
    };
    let eventType = 'specimen_scanned';
    let summary = `Scanned specimen ${specimenId}.`;

    if (body.action === 'collect') {
      Object.assign(updatePayload, {
        specimen_status: 'collected',
        collected_at: now,
        recollection_requested: false,
        recollection_requested_at: null,
        rejection_reason: null,
        rejected_at: null,
      });
      eventType = 'specimen_collected';
      summary = `Collected specimen ${specimenId}.`;
    } else if (body.action === 'start_processing') {
      Object.assign(updatePayload, {
        specimen_status: 'processing',
        processing_started_at: now,
      });
      eventType = 'specimen_processing_started';
      summary = `Started processing specimen ${specimenId}.`;
    } else if (body.action === 'complete') {
      Object.assign(updatePayload, {
        specimen_status: 'completed',
        completed_at: now,
        recollection_requested: false,
      });
      eventType = 'specimen_completed';
      summary = `Completed specimen ${specimenId}.`;
    } else if (body.action === 'reject') {
      Object.assign(updatePayload, {
        specimen_status: 'rejected',
        rejected_at: now,
        rejected_by: userId,
        rejection_reason: body.reason?.trim() || 'No reason provided.',
      });
      eventType = 'specimen_rejected';
      summary = `Rejected specimen ${specimenId}.`;
    } else if (body.action === 'request_recollect') {
      Object.assign(updatePayload, {
        specimen_status: 'rejected',
        recollection_requested: true,
        recollection_requested_at: now,
        rejected_at: now,
        rejected_by: userId,
        rejection_reason: body.reason?.trim() || 'Recollection requested.',
      });
      eventType = 'specimen_recollect_requested';
      summary = `Requested recollection for specimen ${specimenId}.`;
    }

    const { data: updated, error: updateError } = await supabase
      .from('lab_order_items')
      .update(updatePayload)
      .eq('id', currentItem.id)
      .select('id, lab_order_id')
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const { data: order, error: orderError } = await supabase
      .from('lab_orders')
      .select('visit_id, patient_id')
      .eq('id', updated.lab_order_id)
      .single();

    if (orderError) {
      throw new Error(orderError.message);
    }

    await recordAuditEvent({
      eventType,
      entityType: 'lab_order_item',
      entityId: String(updated.id),
      visitId: String(order.visit_id),
      patientId: String(order.patient_id),
      actorStaffId: userId,
      summary,
      detail: body.reason?.trim() || null,
      metadata: {
        specimenId,
        lane: currentItem.service_lane,
        testName: currentItem.test_name,
        action: body.action,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update specimen state.' },
      { status: 500 }
    );
  }
}
