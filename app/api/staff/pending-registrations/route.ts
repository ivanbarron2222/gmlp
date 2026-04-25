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
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function mapRegistration(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    registrationCode: String(row.registration_code ?? ''),
    submittedAt: String(row.created_at),
    firstName: String(row.first_name ?? ''),
    middleName: String(row.middle_name ?? ''),
    lastName: String(row.last_name ?? ''),
    company: String(row.company ?? ''),
    birthDate: String(row.birth_date ?? ''),
    gender: String(row.gender ?? ''),
    contactNumber: String(row.contact_number ?? ''),
    emailAddress: String(row.email_address ?? ''),
    streetAddress: String(row.street_address ?? ''),
    city: String(row.city ?? ''),
    province: String(row.province ?? ''),
    serviceNeeded:
      row.service_needed === 'pre_employment'
        ? 'Pre-Employment'
        : row.service_needed === 'check_up'
          ? 'Check-Up'
          : 'Lab',
    requestedLabService:
      row.requested_lab_service === 'blood_test'
        ? 'Blood Test'
        : row.requested_lab_service === 'drug_test'
          ? 'Drug Test'
          : row.requested_lab_service === 'xray'
            ? 'Xray'
            : row.requested_lab_service === 'ecg'
              ? 'ECG'
            : '',
    selectedServiceCodes: Array.isArray(row.requested_service_codes)
      ? row.requested_service_codes.map((code) => String(code))
      : [],
    notes: String(row.notes ?? ''),
    status: String(row.status ?? ''),
    queueEntry: null,
    labNumbers: [],
  };
}

function mapQueue(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    queueNumber: String(row.queue_number ?? ''),
    patientName: String(row.patient_name ?? ''),
    serviceType:
      row.service_type === 'pre_employment'
        ? 'PRE-EMPLOYMENT'
        : row.service_type === 'check_up'
          ? 'CHECK-UP'
          : 'LAB',
    requestedLabLane:
      row.requested_lab_service === 'blood_test'
        ? 'BLOOD TEST'
        : row.requested_lab_service === 'drug_test'
          ? 'DRUG TEST'
          : row.requested_lab_service === 'xray'
            ? 'XRAY'
            : row.requested_lab_service === 'ecg'
              ? 'ECG'
              : undefined,
    currentLane: 'GENERAL',
    pendingLanes: [],
    completedLanes: [],
    priority: Boolean(row.priority_lane),
    counter: String(row.counter_name ?? 'General Intake'),
    status: row.queue_status === 'now_serving' ? 'serving' : String(row.queue_status ?? 'waiting'),
    createdAt: String(row.created_at),
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { startIso, endIso } = getManilaDayRange();
    const { data, error } = await supabase
      .from('self_registrations')
      .select('*')
      .in('status', ['pending', 'verified'])
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const registrations = (data ?? []).map((row) => mapRegistration(row as Record<string, unknown>));
    const registrationIds = registrations.map((registration) => registration.id);
    const { data: queueRows, error: queueError } = registrationIds.length
      ? await supabase
          .from('queue_entries')
          .select('id, queue_number, service_type, requested_lab_service, priority_lane, counter_name, queue_status, created_at, visits!inner(registration_id)')
          .in('visits.registration_id', registrationIds)
      : { data: [], error: null };

    if (queueError) {
      throw queueError;
    }

    const queueByRegistrationId = new Map<string, ReturnType<typeof mapQueue>>();
    for (const row of queueRows ?? []) {
      const queue = mapQueue(row as Record<string, unknown>);
      const visit = (row as { visits?: { registration_id?: string | null } }).visits;
      const registrationId = String(visit?.registration_id ?? '');
      if (registrationId) {
        queueByRegistrationId.set(registrationId, queue);
      }
    }

    return NextResponse.json({
      registrations: registrations.map((registration) => ({
        ...registration,
        queueEntry: queueByRegistrationId.get(registration.id) ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch pending registrations.',
      },
      { status: 500 }
    );
  }
}
