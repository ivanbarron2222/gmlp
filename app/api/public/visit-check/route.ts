import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { processQueuePings } from '@/lib/queue-pings';

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

function normalizeRegistrationReference(value: unknown) {
  return normalize(value).toUpperCase();
}

type VerificationInput = {
  registrationReference: string;
  birthDate: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
};

function requireVerification(body: Record<string, unknown>): VerificationInput {
  const registrationReference = normalizeRegistrationReference(body.registrationReference);
  const birthDate = normalize(body.birthDate);
  const firstName = normalize(body.firstName);
  const lastName = normalize(body.lastName);
  const emailAddress = normalizeEmail(body.emailAddress);

  if (!birthDate) {
    throw new Error('Birth date is required.');
  }

  if (!registrationReference && (!firstName || !lastName || !emailAddress)) {
    throw new Error('Registration ID and birth date are required.');
  }

  return { registrationReference, birthDate, firstName, lastName, emailAddress };
}

function formatLane(lane: unknown) {
  return String(lane ?? '').replaceAll('_', ' ').toUpperCase();
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

function getReportAvailability(
  reports: Array<{ status?: string | null; pdf_storage_path?: string | null; released_at?: string | null }>
) {
  if (reports.some((report) => report.status === 'released')) {
    return 'released';
  }

  if (reports.some((report) => report.status === 'validated')) {
    return 'validated';
  }

  if (reports.length > 0) {
    return 'pending_validation';
  }

  return 'not_available';
}

type RegistrationRow = {
  id: string | null;
  registration_code: string | null;
  status: string | null;
  service_needed: string | null;
  created_at: string | null;
  patient_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

const queueSelect = `
  id,
  visit_id,
  patient_id,
  queue_number,
  previous_queue_number,
  queue_status,
  current_lane,
  counter_name,
  now_serving_at,
  notification_ping_count,
  last_ping_at,
  response_at,
  missed_at,
  requeue_required_at,
  last_requeued_at,
  requeue_count,
  created_at,
  patients!inner(first_name, middle_name, last_name, contact_number, email_address),
  queue_steps(lane, status, sort_order)
`;

type QueueCheckRow = Record<string, unknown> & {
  id?: string | null;
  queue_steps?: Array<{ lane?: string | null; status?: string | null; sort_order?: number | null }>;
  patients?:
    | {
        first_name?: string | null;
        middle_name?: string | null;
        last_name?: string | null;
        contact_number?: string | null;
        email_address?: string | null;
      }
    | Array<{
        first_name?: string | null;
        middle_name?: string | null;
        last_name?: string | null;
        contact_number?: string | null;
        email_address?: string | null;
      }>
    | null;
};

function toPatientName(
  queue: QueueCheckRow | null,
  registration: RegistrationRow | null
) {
  const registrationName = [registration?.first_name, registration?.middle_name, registration?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (registrationName) {
    return registrationName;
  }

  const patientRecord = Array.isArray(queue?.patients) ? queue?.patients[0] : queue?.patients;
  const queueName = [patientRecord?.first_name, patientRecord?.middle_name, patientRecord?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (queueName) {
    return queueName;
  }

  return [registration?.first_name, registration?.last_name].filter(Boolean).join(' ').trim();
}

async function refetchQueueById(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  queueId: string
) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select(queueSelect)
    .eq('id', queueId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as QueueCheckRow | null;
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

async function resolveRegistrations(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: VerificationInput,
  startIso: string,
  endIso: string
) {
  let query = supabase
    .from('self_registrations')
    .select(
      'id, registration_code, status, service_needed, created_at, patient_id, first_name, middle_name, last_name'
    )
    .eq('birth_date', input.birthDate)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(5);

  if (input.registrationReference) {
    query = query.ilike('registration_code', input.registrationReference);
  } else {
    query = query
      .ilike('first_name', input.firstName)
      .ilike('last_name', input.lastName)
      .ilike('email_address', input.emailAddress);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as RegistrationRow[];
}

async function resolvePatientIds(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: VerificationInput,
  registrationRows: RegistrationRow[]
) {
  const ids = new Set(
    registrationRows.map((registration) => String(registration.patient_id ?? '')).filter(Boolean)
  );

  if (!ids.size && input.firstName && input.lastName && input.emailAddress) {
    const { data, error } = await supabase
      .from('patients')
      .select('id')
      .ilike('first_name', input.firstName)
      .ilike('last_name', input.lastName)
      .eq('birth_date', input.birthDate)
      .ilike('email_address', input.emailAddress)
      .limit(5);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      ids.add(String(row.id));
    }
  }

  return Array.from(ids);
}

async function findQueue(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  registrationIds: string[],
  patientIds: string[],
  today: string,
  startIso: string,
  endIso: string
) {
  let queueRows: QueueCheckRow[] = [];
  let queueError: { message?: string } | null = null;

  if (registrationIds.length) {
    const { data, error } = await supabase
      .from('queue_entries')
      .select(`${queueSelect}, visits!inner(registration_id)`)
      .in('visits.registration_id', registrationIds)
      .eq('queue_date', today)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      queueError = error;
    } else {
      queueRows = (data ?? []) as QueueCheckRow[];
    }
  }

  if (!queueRows.length && patientIds.length) {
    const { data, error } = await supabase
      .from('queue_entries')
      .select(queueSelect)
      .in('patient_id', patientIds)
      .eq('queue_date', today)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      queueError = error;
    } else {
      queueRows = (data ?? []) as QueueCheckRow[];
    }
  }

  if (!queueRows.length && patientIds.length) {
    const { data, error } = await supabase
      .from('queue_entries')
      .select(queueSelect)
      .in('patient_id', patientIds)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      queueError = error;
    } else {
      queueRows = (data ?? []) as QueueCheckRow[];
    }
  }

  if (queueError) {
    throw new Error(queueError.message ?? 'Unable to check queue.');
  }

  return queueRows[0] ?? null;
}

function serializeQueue(queue: QueueCheckRow) {
  const pendingStations = [...(queue.queue_steps ?? [])]
    .filter((step) => step.status === 'pending' || step.status === 'serving')
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((step) => formatLane(step.lane));

  const completedStations = [...(queue.queue_steps ?? [])]
    .filter((step) => step.status === 'completed')
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((step) => formatLane(step.lane));

  return {
    id: String(queue.id),
    visitId: queue.visit_id ? String(queue.visit_id) : '',
    queueNumber: String(queue.queue_number ?? ''),
    previousQueueNumber: queue.previous_queue_number ? String(queue.previous_queue_number) : null,
    status: String(queue.queue_status ?? ''),
    lane: formatLane(queue.current_lane),
    counter: String(queue.counter_name ?? ''),
    calledAt: queue.now_serving_at,
    pingCount: Number(queue.notification_ping_count ?? 0),
    responseAt: queue.response_at,
    missedAt: queue.missed_at,
    requeueRequiredAt: queue.requeue_required_at,
    lastRequeuedAt: queue.last_requeued_at,
    requeueCount: Number(queue.requeue_count ?? 0),
    pendingStations,
    completedStations,
  };
}

async function buildVisitCheckResponse(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: VerificationInput
) {
  const { today, startIso, endIso } = getManilaDayRange();
  const registrationRows = await resolveRegistrations(supabase, input, startIso, endIso);
  const registration = registrationRows[0] ?? null;
  const patientIds = await resolvePatientIds(supabase, input, registrationRows);
  const queue = await findQueue(
    supabase,
    registrationRows.map((row) => String(row.id ?? '')).filter(Boolean),
    patientIds,
    today,
    startIso,
    endIso
  );

  let refreshedQueue = queue;
  if (refreshedQueue) {
    const pingsChanged = await processQueuePings(supabase, [refreshedQueue]);
    if (pingsChanged && refreshedQueue.id) {
      refreshedQueue = (await refetchQueueById(supabase, String(refreshedQueue.id))) ?? refreshedQueue;
    }
  }

  const visitId = refreshedQueue?.visit_id ? String(refreshedQueue.visit_id) : '';
  let reportSummary = {
    availability: 'not_available',
    orderCount: 0,
    reportCount: 0,
    labOrderNumbers: [] as string[],
    releasedAt: null as string | null,
    canView: false,
  };

  if (visitId) {
    const { data: labOrders, error: labOrdersError } = await supabase
      .from('lab_orders')
      .select('id, order_number')
      .eq('visit_id', visitId);

    if (labOrdersError) {
      throw labOrdersError;
    }

    const labOrderIds = (labOrders ?? []).map((order) => String(order.id));
    reportSummary.labOrderNumbers = (labOrders ?? [])
      .map((order) => String(order.order_number ?? '').trim())
      .filter(Boolean);

    if (labOrderIds.length > 0) {
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('status, pdf_storage_path, released_at')
        .in('lab_order_id', labOrderIds);

      if (reportsError) {
        throw reportsError;
      }

      const reportRows = reports ?? [];
      const availability = getReportAvailability(reportRows);
      reportSummary = {
        availability,
        orderCount: labOrderIds.length,
        reportCount: reportRows.length,
        labOrderNumbers: reportSummary.labOrderNumbers,
        releasedAt:
          reportRows
            .map((report) => report.released_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        canView: availability === 'released',
      };
    }
  }

  if (!refreshedQueue && !registration) {
    return { status: 'not_found', registration: null, queue: null, result: reportSummary, patientName: '' };
  }

  return {
    status: refreshedQueue?.queue_status ?? registration?.status ?? 'pending',
    patientName: toPatientName(refreshedQueue, registration),
    registration: registration
      ? {
          id: String(registration.id),
          code: String(registration.registration_code),
          status: String(registration.status),
          service: String(registration.service_needed),
        }
      : null,
    queue: refreshedQueue ? serializeQueue(refreshedQueue) : null,
    result: reportSummary,
  };
}

async function handleAction(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: VerificationInput,
  body: Record<string, unknown>
) {
  const queueId = normalize(body.queueId);
  const action = normalize(body.action);
  const { today, startIso, endIso } = getManilaDayRange();

  if (!queueId) {
    return NextResponse.json({ error: 'Missing queue reference.' }, { status: 400 });
  }

  const registrationRows = await resolveRegistrations(supabase, input, startIso, endIso);
  const patientIds = await resolvePatientIds(supabase, input, registrationRows);

  if (!patientIds.length) {
    return NextResponse.json({ error: 'Visit not found.' }, { status: 404 });
  }

  if (action === 'requeue') {
    const { data: queue, error: queueError } = await supabase
      .from('queue_entries')
      .select('id, patient_id, visit_id, service_type, priority_lane, queue_status, queue_number, requeue_count')
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

    const nextQueueNumber = await getNextQueueNumber(supabase, queue.service_type);
    const now = new Date().toISOString();

    const { error: requeueError } = await supabase
      .from('queue_entries')
      .update({
        previous_queue_number: String(queue.queue_number ?? ''),
        queue_number: nextQueueNumber,
        queue_date: today,
        current_lane: 'general',
        counter_name: queue.priority_lane ? 'Priority Lane' : 'General Intake',
        queue_status: 'waiting',
        now_serving_at: null,
        missed_at: null,
        requeue_required_at: null,
        last_requeued_at: now,
        requeue_count: Number(queue.requeue_count ?? 0) + 1,
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

    return NextResponse.json({
      success: true,
      action: 'requeue',
      queueNumber: nextQueueNumber,
      previousQueueNumber: String(queue.queue_number ?? ''),
      notice: `Re-queued successfully. Your new queue number is ${nextQueueNumber}. Completed stations were kept.`,
    });
  }

  const { error } = await supabase
    .from('queue_entries')
    .update({ response_at: new Date().toISOString() })
    .eq('id', queueId)
    .in('patient_id', patientIds)
    .eq('queue_status', 'now_serving');

  if (error) {
    throw error;
  }

  return NextResponse.json({
    success: true,
    action: 'acknowledge',
    notice: 'Queue call acknowledged.',
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = requireVerification(body);
    const supabase = getSupabaseAdminClient();
    const action = normalize(body.action);

    if (action === 'acknowledge' || action === 'requeue') {
      return await handleAction(supabase, input, body);
    }

    return NextResponse.json(await buildVisitCheckResponse(supabase, input));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to check visit.' },
      { status: 400 }
    );
  }
}
