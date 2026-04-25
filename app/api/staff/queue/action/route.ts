import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  canEnterLane,
  mapQueueEntryRow,
  toPatientFullName,
  uiLaneLabel,
  uiLaneToDbLane,
  type QueueEntryRow,
} from '@/lib/db-queue';
import type { QueueEntry, QueueLane } from '@/lib/queue-store';

type ActionBody =
  | { action: 'accept_next'; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
  | { action: 'call_next'; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
  | { action: 'finish_step'; queueId: string }
  | { action: 'mark_missed'; queueId: string }
  | { action: 'require_requeue'; queueId: string }
  | { action: 'requeue'; queueId: string }
  | { action: 'acknowledge_response'; queueId: string }
  | { action: 'start_step'; queueId: string; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
  | { action: 'add_referral'; queueId: string; lane: Exclude<QueueLane, 'GENERAL' | 'DOCTOR'> };

function createCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function getNextLabOrderNumber(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const { data, error } = await supabase
    .from('lab_orders')
    .select('order_number')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  const maxNumber = (data ?? []).reduce((highest, row) => {
    const match = /^LAB-(\d+)$/i.exec(String(row.order_number ?? '').trim());
    if (!match) {
      return highest;
    }

    const value = Number.parseInt(match[1] ?? '0', 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `LAB-${String(maxNumber + 1).padStart(3, '0')}`;
}

async function fetchQueueRows(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      queue_number,
      service_type,
      requested_lab_service,
      current_lane,
      queue_status,
      counter_name,
      priority_lane,
      created_at,
      now_serving_at,
      missed_at,
      requeue_required_at,
      notification_ping_count,
      last_ping_at,
      response_at,
      completed_at,
      visit_id,
      patient_id,
      patients!inner(first_name, middle_name, last_name, contact_number, email_address),
      queue_steps(id, lane, status, sort_order)
    `)
    .eq('queue_date', today)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<
    QueueEntryRow & {
      visit_id: string;
      patient_id: string;
      queue_steps: Array<{
        id: string;
        lane: 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray' | 'ecg';
        status: 'pending' | 'serving' | 'completed' | 'skipped' | 'cancelled';
        sort_order: number;
      }>;
    }
  >;

  const visitIds = rows.map((row) => row.visit_id).filter(Boolean);
  const doctorByVisitId = new Map<string, { id: string; name: string }>();

  if (visitIds.length > 0) {
    const { data: consultationsData, error: consultationsError } = await supabase
      .from('consultations')
      .select(`
        visit_id,
        doctor_directory_id,
        doctors:doctor_directory_id (
          full_name
        ),
        created_at
      `)
      .in('visit_id', visitIds)
      .not('doctor_directory_id', 'is', null)
      .order('created_at', { ascending: false });

    if (consultationsError) {
      throw consultationsError;
    }

    for (const consultation of consultationsData ?? []) {
      const visitId = String(consultation.visit_id ?? '');

      if (!visitId || doctorByVisitId.has(visitId) || !consultation.doctor_directory_id) {
        continue;
      }

      const doctorProfile = Array.isArray(consultation.doctors)
        ? consultation.doctors[0]
        : consultation.doctors;

      doctorByVisitId.set(visitId, {
        id: String(consultation.doctor_directory_id),
        name: String(doctorProfile?.full_name ?? ''),
      });
    }
  }

  return rows.map((row) => ({
    ...row,
    assigned_doctor_id: doctorByVisitId.get(row.visit_id)?.id ?? null,
    assigned_doctor_name: doctorByVisitId.get(row.visit_id)?.name ?? null,
  }));
}

async function fetchQueueRowById(supabase: ReturnType<typeof getSupabaseAdminClient>, queueId: string) {
  const rows = await fetchQueueRows(supabase);
  return rows.find((row) => row.id === queueId) ?? null;
}

async function respondWithQueue(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const rows = await fetchQueueRows(supabase);
  return NextResponse.json({
    queue: rows.map((row) => mapQueueEntryRow(row)),
  });
}

async function completeCurrentStepAndQueue(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  row: Awaited<ReturnType<typeof fetchQueueRows>>[number]
) {
  const currentLane = row.current_lane;
  const currentStep = row.queue_steps.find((step) => step.lane === currentLane);

  if (!currentStep) {
    return;
  }

  const now = new Date().toISOString();
  const { error: stepError } = await supabase
    .from('queue_steps')
    .update({ status: 'completed', completed_at: now })
    .eq('id', currentStep.id);

  if (stepError) {
    throw stepError;
  }

  const remainingPending = row.queue_steps.filter(
    (step) => step.id !== currentStep.id && (step.status === 'pending' || step.status === 'serving')
  );

  if (currentLane === 'doctor') {
    await supabase
      .from('consultations')
      .update({ status: 'completed', completed_at: now })
      .eq('visit_id', row.visit_id);
  }

  if (remainingPending.length === 0) {
    const { error } = await supabase
      .from('queue_entries')
      .update({
        queue_status: 'completed',
        completed_at: now,
      })
      .eq('id', row.id);

    if (error) {
      throw error;
    }

    const { error: visitError } = await supabase
      .from('visits')
      .update({ status: 'completed', completed_at: now })
      .eq('id', row.visit_id);

    if (visitError) {
      throw visitError;
    }
  } else {
    const { error } = await supabase
      .from('queue_entries')
      .update({
        current_lane: 'general',
        counter_name: row.priority_lane ? 'Priority Lane' : 'General Intake',
        queue_status: 'waiting',
        now_serving_at: null,
        notification_ping_count: 0,
        last_ping_at: null,
        response_at: null,
      })
      .eq('id', row.id);

    if (error) {
      throw error;
    }

    const { error: visitError } = await supabase
      .from('visits')
      .update({ current_lane: 'general' })
      .eq('id', row.visit_id);

    if (visitError) {
      throw visitError;
    }
  }
}

function matchesDoctorAssignment(
  row: Awaited<ReturnType<typeof fetchQueueRows>>[number],
  actorStaffId?: string
) {
  return true;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActionBody;
    const supabase = getSupabaseAdminClient();

    if (body.action === 'accept_next') {
      const rows = await fetchQueueRows(supabase);
      const lane = body.lane;
      const priorityCandidate = rows
        .map((row) => ({ row, entry: mapQueueEntryRow(row) }))
        .find(
          ({ row, entry }) =>
            row.queue_status === 'waiting' &&
            row.current_lane === 'general' &&
            row.priority_lane &&
            matchesDoctorAssignment(row, body.lane === 'DOCTOR' ? body.actorStaffId : undefined) &&
            canEnterLane(entry, lane)
        );

      const standardCandidate = rows
        .map((row) => ({ row, entry: mapQueueEntryRow(row) }))
        .find(
          ({ row, entry }) =>
            row.queue_status === 'waiting' &&
            row.current_lane === 'general' &&
            !row.priority_lane &&
            matchesDoctorAssignment(row, body.lane === 'DOCTOR' ? body.actorStaffId : undefined) &&
            canEnterLane(entry, lane)
        );

      const candidate = priorityCandidate ?? standardCandidate;

      if (!candidate) {
        return respondWithQueue(supabase);
      }

      const dbLane = uiLaneToDbLane(lane);
      const { error } = await supabase
        .from('queue_entries')
        .update({
          current_lane: dbLane,
          counter_name: uiLaneLabel(lane, candidate.row.priority_lane),
        })
        .eq('id', candidate.row.id);

      if (error) {
        throw error;
      }

      const { error: visitError } = await supabase
        .from('visits')
        .update({ current_lane: dbLane })
        .eq('id', candidate.row.visit_id);

      if (visitError) {
        throw visitError;
      }

      return respondWithQueue(supabase);
    }

    if (body.action === 'call_next') {
      const dbLane = uiLaneToDbLane(body.lane);
      const rows = await fetchQueueRows(supabase);
      const currentServing = rows.find(
        (row) =>
          row.current_lane === dbLane &&
          row.queue_status === 'now_serving' &&
          matchesDoctorAssignment(row, body.lane === 'DOCTOR' ? body.actorStaffId : undefined)
      );

      if (currentServing) {
        await completeCurrentStepAndQueue(supabase, currentServing);
      }

      const refreshedRows = await fetchQueueRows(supabase);
      const nextWaiting =
        refreshedRows.find(
          (row) =>
            row.current_lane === dbLane &&
            row.queue_status === 'waiting' &&
            matchesDoctorAssignment(row, body.lane === 'DOCTOR' ? body.actorStaffId : undefined)
        ) ??
        refreshedRows
          .map((row) => ({ row, entry: mapQueueEntryRow(row) }))
          .find(
            ({ row, entry }) =>
              row.queue_status === 'waiting' &&
              row.current_lane === 'general' &&
              row.priority_lane &&
              matchesDoctorAssignment(row, body.lane === 'DOCTOR' ? body.actorStaffId : undefined) &&
              canEnterLane(entry, body.lane)
          )?.row ??
        refreshedRows
          .map((row) => ({ row, entry: mapQueueEntryRow(row) }))
          .find(
            ({ row, entry }) =>
              row.queue_status === 'waiting' &&
              row.current_lane === 'general' &&
              !row.priority_lane &&
              matchesDoctorAssignment(row, body.lane === 'DOCTOR' ? body.actorStaffId : undefined) &&
              canEnterLane(entry, body.lane)
          )?.row;

      if (nextWaiting) {
        if (nextWaiting.current_lane === 'general') {
          const { error: moveError } = await supabase
            .from('queue_entries')
            .update({
              current_lane: dbLane,
              counter_name: uiLaneLabel(body.lane, nextWaiting.priority_lane),
            })
            .eq('id', nextWaiting.id);

          if (moveError) {
            throw moveError;
          }

          const { error: visitMoveError } = await supabase
            .from('visits')
            .update({ current_lane: dbLane })
            .eq('id', nextWaiting.visit_id);

          if (visitMoveError) {
            throw visitMoveError;
          }
        }

        const now = new Date().toISOString();
        const { error } = await supabase
          .from('queue_entries')
          .update({
            queue_status: 'now_serving',
            now_serving_at: now,
            notification_ping_count: 0,
            last_ping_at: null,
            response_at: null,
          })
          .eq('id', nextWaiting.id);

        if (error) {
          throw error;
        }

        const targetStep = nextWaiting.queue_steps.find((step) => step.lane === dbLane);
        if (targetStep) {
          const { error: stepError } = await supabase
            .from('queue_steps')
            .update({ status: 'serving', started_at: now })
            .eq('id', targetStep.id);

          if (stepError) {
            throw stepError;
          }
        }
      }

      const queueRows = await fetchQueueRows(supabase);
      return NextResponse.json({
        queue: queueRows.map((row) => mapQueueEntryRow(row)),
        activatedQueueId: nextWaiting?.id ?? null,
      });
    }

    if (body.action === 'start_step') {
      const row = await fetchQueueRowById(supabase, body.queueId);

      if (!row) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      const lane = body.lane;
      const entry = mapQueueEntryRow(row);
      const canStartCurrentLane = entry.currentLane === lane && entry.pendingLanes.includes(lane);
      const canMoveFromGeneral = entry.currentLane === 'GENERAL' && canEnterLane(entry, lane);
      const doctorMatches =
        lane !== 'DOCTOR' || matchesDoctorAssignment(row, body.actorStaffId);

      if ((!canStartCurrentLane && !canMoveFromGeneral) || !doctorMatches) {
        return respondWithQueue(supabase);
      }

      const dbLane = uiLaneToDbLane(lane);
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('queue_entries')
        .update({
          current_lane: dbLane,
          counter_name: uiLaneLabel(lane, row.priority_lane),
            queue_status: 'now_serving',
            now_serving_at: now,
            notification_ping_count: 0,
            last_ping_at: null,
            response_at: null,
          })
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      const { error: visitError } = await supabase
        .from('visits')
        .update({ current_lane: dbLane })
        .eq('id', row.visit_id);

      if (visitError) {
        throw visitError;
      }

      const currentStep = row.queue_steps.find((step) => step.lane === dbLane);
      if (currentStep) {
        const { error: stepError } = await supabase
          .from('queue_steps')
          .update({ status: 'serving', started_at: now })
          .eq('id', currentStep.id);

        if (stepError) {
          throw stepError;
        }
      }

      if (dbLane === 'doctor') {
        await supabase
          .from('consultations')
          .update({ status: 'in_progress', started_at: now })
          .eq('visit_id', row.visit_id)
          .eq('status', 'pending');
      }

      return respondWithQueue(supabase);
    }

    if (body.action === 'finish_step') {
      const row = await fetchQueueRowById(supabase, body.queueId);

      if (!row) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      if (!row.queue_steps.find((step) => step.lane === row.current_lane)) {
        return respondWithQueue(supabase);
      }
      await completeCurrentStepAndQueue(supabase, row);

      return respondWithQueue(supabase);
    }

    if (body.action === 'acknowledge_response') {
      const row = await fetchQueueRowById(supabase, body.queueId);

      if (!row) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      const { error } = await supabase
        .from('queue_entries')
        .update({ response_at: new Date().toISOString() })
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      return respondWithQueue(supabase);
    }

    if (body.action === 'mark_missed' || body.action === 'require_requeue') {
      const row = await fetchQueueRowById(supabase, body.queueId);

      if (!row) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      const now = new Date().toISOString();
      const currentStep = row.queue_steps.find((step) => step.lane === row.current_lane);

      if (currentStep?.status === 'serving') {
        const { error: stepError } = await supabase
          .from('queue_steps')
          .update({ status: 'pending', started_at: null })
          .eq('id', currentStep.id);

        if (stepError) {
          throw stepError;
        }
      }

      const queueStatus = body.action === 'mark_missed' ? 'missed' : 'requeue_required';
      const { error } = await supabase
        .from('queue_entries')
        .update({
          queue_status: queueStatus,
          missed_at: now,
          requeue_required_at: body.action === 'require_requeue' ? now : null,
          response_at: null,
        })
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      return respondWithQueue(supabase);
    }

    if (body.action === 'requeue') {
      const row = await fetchQueueRowById(supabase, body.queueId);

      if (!row) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      const currentStep = row.queue_steps.find((step) => step.lane === row.current_lane);

      if (currentStep?.status === 'serving') {
        const { error: stepError } = await supabase
          .from('queue_steps')
          .update({ status: 'pending', started_at: null })
          .eq('id', currentStep.id);

        if (stepError) {
          throw stepError;
        }
      }

      const { error } = await supabase
        .from('queue_entries')
        .update({
          current_lane: 'general',
          counter_name: row.priority_lane ? 'Priority Lane' : 'General Intake',
          queue_status: 'waiting',
          now_serving_at: null,
          missed_at: null,
          requeue_required_at: null,
          notification_ping_count: 0,
          last_ping_at: null,
          response_at: null,
        })
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      const { error: visitError } = await supabase
        .from('visits')
        .update({ current_lane: 'general' })
        .eq('id', row.visit_id);

      if (visitError) {
        throw visitError;
      }

      return respondWithQueue(supabase);
    }

    if (body.action === 'add_referral') {
      const row = await fetchQueueRowById(supabase, body.queueId);

      if (!row) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      const dbLane = uiLaneToDbLane(body.lane);
      const existingStep = row.queue_steps.find((step) => step.lane === dbLane);

      if (!existingStep) {
        const nextSortOrder =
          row.queue_steps.reduce((max, step) => Math.max(max, step.sort_order), 0) + 1;

        const { error: stepError } = await supabase.from('queue_steps').insert({
          visit_id: row.visit_id,
          queue_entry_id: row.id,
          lane: dbLane,
          sort_order: nextSortOrder,
          is_required: false,
        });

        if (stepError) {
          throw stepError;
        }
      }

      const { data: existingOrder, error: orderError } = await supabase
        .from('lab_orders')
        .select('id')
        .eq('visit_id', row.visit_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderError) {
        throw orderError;
      }

      let labOrderId = existingOrder?.id ?? null;

      if (!labOrderId) {
        const consultation = await supabase
          .from('consultations')
          .select('id')
          .eq('visit_id', row.visit_id)
          .maybeSingle();

        const { data: createdOrder, error: createdOrderError } = await supabase
          .from('lab_orders')
          .insert({
            order_number: await getNextLabOrderNumber(supabase),
            visit_id: row.visit_id,
            patient_id: row.patient_id,
            consultation_id: consultation.data?.id ?? null,
            source: 'doctor_referral',
            status: 'ordered',
          })
          .select('id')
          .single();

        if (createdOrderError || !createdOrder) {
          throw new Error(createdOrderError?.message ?? 'Failed to create referral order.');
        }

        labOrderId = createdOrder.id;
      }

      const testCode =
        body.lane === 'BLOOD TEST'
          ? 'REF-BLOOD'
          : body.lane === 'DRUG TEST'
            ? 'REF-DRUG'
            : body.lane === 'XRAY'
              ? 'REF-XRAY'
              : 'REF-ECG';
      const testName =
        body.lane === 'BLOOD TEST'
          ? 'Blood Test Referral'
          : body.lane === 'DRUG TEST'
            ? 'Drug Test Referral'
            : body.lane === 'XRAY'
              ? 'Xray Referral'
              : 'ECG Referral';
      const requestedLabService =
        body.lane === 'BLOOD TEST'
          ? 'blood_test'
          : body.lane === 'DRUG TEST'
            ? 'drug_test'
            : body.lane === 'XRAY'
              ? 'xray'
              : 'ecg';

      const { data: existingItem, error: existingItemError } = await supabase
        .from('lab_order_items')
        .select('id')
        .eq('lab_order_id', labOrderId)
        .eq('test_code', testCode)
        .maybeSingle();

      if (existingItemError) {
        throw existingItemError;
      }

      if (!existingItem) {
        const { error: itemError } = await supabase.from('lab_order_items').insert({
          lab_order_id: labOrderId,
          service_lane: dbLane,
          requested_lab_service: requestedLabService,
          test_code: testCode,
          test_name: testName,
          sample_id: createCode('SMP'),
        });

        if (itemError) {
          throw itemError;
        }
      }

      return respondWithQueue(supabase);
    }

    return NextResponse.json({ error: 'Unsupported queue action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update queue.' },
      { status: 500 }
    );
  }
}
