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

function formatLane(lane: unknown) {
  return String(lane ?? '').replaceAll('_', ' ').toUpperCase();
}

function getReportAvailability(reports: Array<{ status?: string | null; pdf_storage_path?: string | null; released_at?: string | null }>) {
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

const queueSelect = `
  id,
  visit_id,
  patient_id,
  queue_number,
  queue_status,
  current_lane,
  counter_name,
  now_serving_at,
  notification_ping_count,
  last_ping_at,
  response_at,
  missed_at,
  requeue_required_at,
  created_at,
  patients!inner(contact_number, email_address),
  queue_steps(lane, status, sort_order)
`;

type QueueCheckRow = Record<string, unknown> & {
  id?: string | null;
  queue_steps?: Array<{ lane?: string | null; status?: string | null; sort_order?: number | null }>;
};

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = requireVerification(body);
    const supabase = getSupabaseAdminClient();
    const { today, startIso, endIso } = getManilaDayRange();

    let registrationQuery = supabase
      .from('self_registrations')
      .select('id, registration_code, status, service_needed, created_at, patient_id')
      .ilike('first_name', input.firstName)
      .ilike('last_name', input.lastName)
      .eq('birth_date', input.birthDate)
      .ilike('email_address', input.emailAddress)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(5);

    if (input.registrationReference) {
      registrationQuery = registrationQuery.or(
        `registration_code.ilike.${input.registrationReference}`
      );
    }

    const { data: registrations, error: registrationError } = await registrationQuery;

    if (registrationError) {
      throw registrationError;
    }

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

    const registrationRows = registrations ?? [];
    const patientIds = Array.from(
      new Set([
        ...(patients ?? []).map((patient) => String(patient.id)),
        ...registrationRows.map((registration) => String(registration.patient_id ?? '')).filter(Boolean),
      ])
    );
    const registrationIds = registrationRows.map((registration) => String(registration.id));

    let queueRows: QueueCheckRow[] = [];
    let queueError: { message?: string } | null = null;

    if (input.registrationReference) {
      const { data: referenceQueueRows, error: referenceQueueError } = await supabase
        .from('queue_entries')
        .select(
          `${queueSelect}, visits!inner(registration_id)`
        )
        .or(`queue_number.ilike.${input.registrationReference}`)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1);

      if (referenceQueueError) {
        queueError = referenceQueueError;
      } else {
        queueRows = (referenceQueueRows ?? []) as typeof queueRows;
      }
    }

    if (!queueRows.length && patientIds.length) {
      const { data: patientQueueRows, error: patientQueueError } = await supabase
          .from('queue_entries')
          .select(queueSelect)
          .in('patient_id', patientIds)
          .eq('queue_date', today)
          .order('created_at', { ascending: false })
          .limit(1);

      if (patientQueueError) {
        queueError = patientQueueError;
      } else {
        queueRows = (patientQueueRows ?? []) as typeof queueRows;
      }
    }

    if (!queueRows.length && patientIds.length) {
      const { data: fallbackQueueRows, error: fallbackQueueError } = await supabase
        .from('queue_entries')
        .select(queueSelect)
        .in('patient_id', patientIds)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fallbackQueueError) {
        queueError = fallbackQueueError;
      } else {
        queueRows = (fallbackQueueRows ?? []) as typeof queueRows;
      }
    }

    if (!queueRows.length && registrationIds.length) {
      const { data: registrationQueueRows, error: registrationQueueError } = await supabase
        .from('queue_entries')
        .select(
          `${queueSelect}, visits!inner(registration_id)`
        )
        .in('visits.registration_id', registrationIds)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1);

      if (registrationQueueError) {
        queueError = registrationQueueError;
      } else {
        queueRows = (registrationQueueRows ?? []) as typeof queueRows;
      }
    }

    if (queueError) {
      throw new Error(queueError.message ?? 'Unable to check queue.');
    }

    let queue = queueRows?.[0] ?? null;
    if (queue) {
      const pingsChanged = await processQueuePings(supabase, [queue]);
      if (pingsChanged && queue.id) {
        queue = (await refetchQueueById(supabase, String(queue.id))) ?? queue;
      }
    }
    const registration = registrationRows?.[0] ?? null;
    const visitId = queue?.visit_id ? String(queue.visit_id) : '';
    let reportSummary = {
      availability: 'not_available',
      orderCount: 0,
      reportCount: 0,
      releasedAt: null as string | null,
      canView: false,
    };

    if (visitId) {
      const { data: labOrders, error: labOrdersError } = await supabase
        .from('lab_orders')
        .select('id')
        .eq('visit_id', visitId);

      if (labOrdersError) {
        throw labOrdersError;
      }

      const labOrderIds = (labOrders ?? []).map((order) => String(order.id));
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

    if (!queue && !registration) {
      return NextResponse.json({ status: 'not_found' });
    }

    return NextResponse.json({
      status: queue?.queue_status ?? registration?.status ?? 'pending',
      registration: registration
        ? {
            id: String(registration.id),
            code: String(registration.registration_code),
            status: String(registration.status),
            service: String(registration.service_needed),
          }
        : null,
          queue: queue
        ? {
            id: String(queue.id),
            visitId,
            queueNumber: String(queue.queue_number),
            status: String(queue.queue_status),
            lane: formatLane(queue.current_lane),
            counter: String(queue.counter_name ?? ''),
            calledAt: queue.now_serving_at,
            pingCount: Number(queue.notification_ping_count ?? 0),
            responseAt: queue.response_at,
            missedAt: queue.missed_at,
            requeueRequiredAt: queue.requeue_required_at,
            pendingStations: [...(queue.queue_steps ?? [])]
              .filter((step) => step.status === 'pending' || step.status === 'serving')
              .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
              .map((step) => formatLane(step.lane)),
            completedStations: [...(queue.queue_steps ?? [])]
              .filter((step) => step.status === 'completed')
              .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
              .map((step) => formatLane(step.lane)),
          }
        : null,
      result: reportSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to check visit.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = requireVerification(body);
    const queueId = normalize(body.queueId);

    if (!queueId) {
      return NextResponse.json({ error: 'Missing queue reference.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
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

    const patientIds = (patients ?? []).map((patient) => String(patient.id));
    if (!patientIds.length) {
      return NextResponse.json({ error: 'Visit not found.' }, { status: 404 });
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

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to acknowledge queue call.' },
      { status: 400 }
    );
  }
}
