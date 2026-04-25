import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function getManilaDayRange() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const start = new Date(`${today}T00:00:00+08:00`);
  const end = new Date(`${today}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    today,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeEmail(value: unknown) {
  return normalize(value).toLowerCase();
}

function requireVerification(body: Record<string, unknown>) {
  const firstName = normalize(body.firstName);
  const lastName = normalize(body.lastName);
  const birthDate = normalize(body.birthDate);
  const emailAddress = normalizeEmail(body.emailAddress);
  const registrationReference = normalize(body.registrationReference);

  if (!firstName || !lastName || !birthDate || !emailAddress) {
    throw new Error('Name, birth date, and email are required.');
  }

  return { firstName, lastName, birthDate, emailAddress, registrationReference };
}

function getQueuePrefix(serviceType: unknown) {
  switch (String(serviceType ?? '')) {
    case 'pre_employment':
      return 'P';
    case 'check_up':
      return 'C';
    case 'lab':
      return 'L';
    default:
      return 'P';
  }
}

async function getNextQueueNumber(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  serviceType: unknown
) {
  const { startIso, endIso } = getManilaDayRange();
  const prefix = getQueuePrefix(serviceType);
  const { data, error } = await supabase
    .from('queue_entries')
    .select('queue_number')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  const maxNumber = (data ?? []).reduce((highest, row) => {
    const [currentPrefix, numeric] = String((row as { queue_number?: string | null }).queue_number ?? '').split('-');

    if (currentPrefix !== prefix) {
      return highest;
    }

    const value = Number.parseInt(numeric ?? '0', 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `${prefix}-${String(maxNumber + 1).padStart(3, '0')}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = requireVerification(body);
    const queueId = normalize(body.queueId);
    const action = normalize(body.action);

    if (!queueId) {
      return NextResponse.json({ error: 'Missing queue reference.' }, { status: 400 });
    }

    if (!['acknowledge', 'requeue'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported visit action.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { startIso, endIso } = getManilaDayRange();
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .ilike('first_name', input.firstName)
      .ilike('last_name', input.lastName)
      .eq('birth_date', input.birthDate)
      .ilike('email_address', input.emailAddress)
      .limit(5);

    if (patientError) {
      throw patientError;
    }

    let registrationQuery = supabase
      .from('self_registrations')
      .select('patient_id')
      .ilike('first_name', input.firstName)
      .ilike('last_name', input.lastName)
      .eq('birth_date', input.birthDate)
      .ilike('email_address', input.emailAddress)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(5);

    if (input.registrationReference) {
      registrationQuery = registrationQuery.or(`registration_code.ilike.${input.registrationReference}`);
    }

    const { data: registrations, error: registrationError } = await registrationQuery;

    if (registrationError) {
      throw registrationError;
    }

    const patientIds = Array.from(
      new Set([
        ...(patients ?? []).map((patient) => String(patient.id)),
        ...(registrations ?? []).map((registration) => String(registration.patient_id ?? '')).filter(Boolean),
      ])
    );

    if (!patientIds.length) {
      return NextResponse.json({ error: 'Visit not found.' }, { status: 404 });
    }

    if (action === 'requeue') {
      const { data: queue, error: queueError } = await supabase
        .from('queue_entries')
        .select('id, patient_id, visit_id, service_type, priority_lane, queue_status')
        .eq('id', queueId)
        .in('patient_id', patientIds)
        .maybeSingle();

      if (queueError) {
        throw queueError;
      }

      if (!queue) {
        return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
      }

      if (!['missed', 'requeue_required'].includes(String(queue.queue_status))) {
        return NextResponse.json({ error: 'This queue is not eligible for re-queue.' }, { status: 400 });
      }

      const { today } = getManilaDayRange();
      const nextQueueNumber = await getNextQueueNumber(supabase, queue.service_type);

      const { error: requeueError } = await supabase
        .from('queue_entries')
        .update({
          queue_number: nextQueueNumber,
          queue_date: today,
          current_lane: 'general',
          counter_name: queue.priority_lane ? 'Priority Lane' : 'General Intake',
          queue_status: 'waiting',
          now_serving_at: null,
          missed_at: null,
          requeue_required_at: null,
          notification_ping_count: 0,
          last_ping_at: null,
          response_at: null,
        })
        .eq('id', queueId)
        .in('patient_id', patientIds);

      if (requeueError) {
        throw requeueError;
      }

      const { error: visitError } = await supabase
        .from('visits')
        .update({ current_lane: 'general' })
        .eq('id', String(queue.visit_id));

      if (visitError) {
        throw visitError;
      }
    } else {
      const { error } = await supabase
        .from('queue_entries')
        .update({ response_at: new Date().toISOString() })
        .eq('id', queueId)
        .in('patient_id', patientIds)
        .eq('queue_status', 'now_serving');

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update queue.' },
      { status: 400 }
    );
  }
}
