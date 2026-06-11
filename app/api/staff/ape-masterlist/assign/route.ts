import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';
import { toVisitContextPayload } from '@/lib/visit-context';

function createCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeGender(value: string | null | undefined): 'male' | 'female' | 'other' {
  const nextValue = String(value ?? '').trim().toLowerCase();
  if (nextValue === 'm' || nextValue === 'male') return 'male';
  if (nextValue === 'f' || nextValue === 'female') return 'female';
  return 'other';
}

function getManilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function getNextMissionQueueNumber(supabase: ReturnType<typeof import('@/lib/supabase/admin').getSupabaseAdminClient>) {
  const manilaDate = getManilaDate();
  const { count, error } = await supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('queue_date', manilaDate);

  if (error) {
    throw new Error(error.message);
  }

  return {
    queueDate: manilaDate,
    queueNumber: `Q-${String((count ?? 0) + 1).padStart(3, '0')}`,
  };
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    const body = (await request.json()) as {
      masterlistPatientId?: string;
      labOrderPoolId?: string;
    };

    if (!body.masterlistPatientId || !body.labOrderPoolId) {
      return NextResponse.json({ error: 'Masterlist patient and lab order are required.' }, { status: 400 });
    }

    const [{ data: masterPatient, error: patientError }, { data: labOrderPool, error: labOrderError }] =
      await Promise.all([
        context.supabase
          .from('ape_masterlist_patients')
          .select('*')
          .eq('id', body.masterlistPatientId)
          .single(),
        context.supabase
          .from('ape_lab_order_pool')
          .select('*')
          .eq('id', body.labOrderPoolId)
          .eq('status', 'available')
          .single(),
      ]);

    if (patientError || !masterPatient) {
      throw new Error(patientError?.message ?? 'Masterlist patient not found.');
    }
    if (labOrderError || !labOrderPool) {
      throw new Error(labOrderError?.message ?? 'Selected lab order is no longer available.');
    }
    if (masterPatient.assigned_lab_order_id) {
      return NextResponse.json({ error: 'This masterlist patient already has an assigned lab order.' }, { status: 409 });
    }

    const contextPayload = toVisitContextPayload({
      visitContext: 'ape',
      apeEventId: String(masterPatient.ape_event_id),
      apeModeEnabled: true,
      apeEvent: null,
    });

    let patientId = masterPatient.assigned_patient_id ? String(masterPatient.assigned_patient_id) : '';

    if (!patientId) {
      const { data: patient, error: createPatientError } = await context.supabase
        .from('patients')
        .insert({
          patient_code: createCode('PAT'),
          first_name: masterPatient.first_name,
          middle_name: masterPatient.middle_name,
          last_name: masterPatient.last_name,
          company: masterPatient.company_name,
          birth_date: masterPatient.birth_date ?? '1900-01-01',
          gender: normalizeGender(masterPatient.gender),
          contact_number: masterPatient.contact_number,
          email_address: masterPatient.email_address,
          notes: `APE masterlist assignment. Original row: ${masterPatient.row_number}.`,
          first_visit_context: 'ape',
          first_ape_event_id: masterPatient.ape_event_id,
          sync_status: 'synced',
          last_modified_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (createPatientError || !patient) {
        throw new Error(createPatientError?.message ?? 'Unable to create patient profile.');
      }

      patientId = String(patient.id);
    }

    const { data: visit, error: visitError } = await context.supabase
      .from('visits')
      .insert({
        visit_code: createCode('VIS'),
        patient_id: patientId,
        service_type: 'pre_employment',
        current_lane: 'general',
        notes: `APE lab order ${labOrderPool.lab_order_number}`,
        checked_in_by: context.userId,
        ...contextPayload,
      })
      .select('id')
      .single();

    if (visitError || !visit) {
      throw new Error(visitError?.message ?? 'Unable to create visit.');
    }

    const { queueDate, queueNumber } = await getNextMissionQueueNumber(context.supabase);
    const { data: queueEntry, error: queueError } = await context.supabase
      .from('queue_entries')
      .insert({
        queue_number: queueNumber,
        queue_date: queueDate,
        visit_id: visit.id,
        patient_id: patientId,
        service_type: 'pre_employment',
        current_lane: 'general',
        queue_status: 'waiting',
        counter_name: 'Mission Intake',
        priority_lane: false,
        ...contextPayload,
      })
      .select('id, queue_number')
      .single();

    if (queueError || !queueEntry) {
      throw new Error(queueError?.message ?? 'Unable to create queue entry.');
    }

    const { data: labOrder, error: createLabOrderError } = await context.supabase
      .from('lab_orders')
      .insert({
        order_number: labOrderPool.lab_order_number,
        visit_id: visit.id,
        patient_id: patientId,
        source: 'system_pre_employment',
        status: 'ordered',
        mission_company_name: masterPatient.company_name,
        ...contextPayload,
      })
      .select('id, order_number')
      .single();

    if (createLabOrderError || !labOrder) {
      throw new Error(createLabOrderError?.message ?? 'Unable to create lab order.');
    }

    const [{ error: poolUpdateError }, { error: masterUpdateError }] = await Promise.all([
      context.supabase
        .from('ape_lab_order_pool')
        .update({
          status: 'assigned',
          assigned_masterlist_patient_id: masterPatient.id,
          assigned_patient_id: patientId,
          assigned_visit_id: visit.id,
          assigned_by: context.userId,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', labOrderPool.id)
        .eq('status', 'available'),
      context.supabase
        .from('ape_masterlist_patients')
        .update({
          assigned_patient_id: patientId,
          assigned_lab_order_id: labOrderPool.id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', masterPatient.id),
    ]);

    if (poolUpdateError) {
      throw new Error(poolUpdateError.message);
    }
    if (masterUpdateError) {
      throw new Error(masterUpdateError.message);
    }

    await context.supabase.from('audit_events').insert({
      event_type: 'ape_lab_order_assigned',
      entity_type: 'ape_lab_order_pool',
      entity_id: String(labOrderPool.id),
      visit_id: visit.id,
      patient_id: patientId,
      queue_entry_id: queueEntry.id,
      actor_staff_id: context.userId,
      summary: `APE lab order ${labOrderPool.lab_order_number} assigned`,
      detail: `${context.fullName} assigned ${labOrderPool.lab_order_number} to ${masterPatient.first_name} ${masterPatient.last_name}.`,
      metadata: {
        apeEventId: masterPatient.ape_event_id,
        companyName: masterPatient.company_name,
        masterlistPatientId: masterPatient.id,
      },
    });

    return NextResponse.json({
      assignment: {
        patientId,
        visitId: String(visit.id),
        queueEntryId: String(queueEntry.id),
        queueNumber: String(queueEntry.queue_number),
        labOrderNumber: String(labOrder.order_number),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to assign APE lab order.' },
      { status: 500 }
    );
  }
}
