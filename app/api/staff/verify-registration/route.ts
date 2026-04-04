import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type ServiceNeeded = 'Pre-Employment' | 'Check-Up' | 'Lab';
type RequestedLabService = 'Blood Test' | 'Drug Test' | 'Xray' | '';

interface VerifyRegistrationRequest {
  registrationId?: string | null;
  formData: {
    firstName: string;
    middleName: string;
    lastName: string;
    company: string;
    birthDate: string;
    gender: string;
    contactNumber: string;
    emailAddress: string;
    streetAddress: string;
    city: string;
    province: string;
    serviceNeeded: ServiceNeeded;
    requestedLabService: RequestedLabService;
    notes: string;
  };
}

function getReadableVerifyError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { code?: string; message?: string; details?: string };
    const message = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.trim();

    if (
      maybeError.code === '23505' &&
      (message.includes('queue_entries_queue_number_key') ||
        message.includes('queue_entries_queue_number_queue_date_key'))
    ) {
      return 'Queue numbering is blocked by the database schema. Run the latest queue migration, then try verifying again.';
    }
  }

  return error instanceof Error
    ? error.message
    : 'Failed to verify and queue registration.';
}

function createCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getManilaDayRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const manilaDate = formatter.format(now);
  const start = new Date(`${manilaDate}T00:00:00+08:00`);
  const end = new Date(`${manilaDate}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
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

function toDbService(service: ServiceNeeded) {
  switch (service) {
    case 'Pre-Employment':
      return 'pre_employment';
    case 'Check-Up':
      return 'check_up';
    case 'Lab':
      return 'lab';
  }
}

function toDbQueueService(service: ServiceNeeded) {
  switch (service) {
    case 'Pre-Employment':
      return 'pre_employment';
    case 'Check-Up':
      return 'check_up';
    case 'Lab':
      return 'lab';
  }
}

function toDbLabService(service: RequestedLabService) {
  switch (service) {
    case 'Blood Test':
      return 'blood_test';
    case 'Drug Test':
      return 'drug_test';
    case 'Xray':
      return 'xray';
    default:
      return null;
  }
}

function toLocalQueueService(service: ServiceNeeded) {
  switch (service) {
    case 'Pre-Employment':
      return 'PRE-EMPLOYMENT';
    case 'Check-Up':
      return 'CHECK-UP';
    case 'Lab':
      return 'LAB';
  }
}

function toLocalRequestedLane(service: RequestedLabService) {
  switch (service) {
    case 'Blood Test':
      return 'BLOOD TEST';
    case 'Drug Test':
      return 'DRUG TEST';
    case 'Xray':
      return 'XRAY';
    default:
      return undefined;
  }
}

function buildPendingLanes(
  service: ServiceNeeded,
  requestedLabService: RequestedLabService
): Array<'BLOOD TEST' | 'DRUG TEST' | 'DOCTOR' | 'XRAY'> {
  switch (service) {
    case 'Pre-Employment':
      return ['BLOOD TEST', 'DRUG TEST', 'DOCTOR', 'XRAY'];
    case 'Check-Up':
      return ['DOCTOR'];
    case 'Lab': {
      const requestedLane = toLocalRequestedLane(requestedLabService);
      return requestedLane ? [requestedLane] : ['BLOOD TEST'];
    }
  }
}

function buildDbQueueSteps(
  service: ServiceNeeded,
  requestedLabService: RequestedLabService
) {
  switch (service) {
    case 'Pre-Employment':
      return [
        { lane: 'blood_test', sort_order: 1, is_required: true },
        { lane: 'drug_test', sort_order: 2, is_required: true },
        { lane: 'doctor', sort_order: 3, is_required: true },
        { lane: 'xray', sort_order: 4, is_required: true },
      ];
    case 'Check-Up':
      return [{ lane: 'doctor', sort_order: 1, is_required: true }];
    case 'Lab': {
      const requestedLane = toDbLabService(requestedLabService) ?? 'blood_test';
      return [{ lane: requestedLane, sort_order: 1, is_required: true }];
    }
  }
}

async function getNextQueueNumber(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const { startIso, endIso } = getManilaDayRange();
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
    const value = Number.parseInt(String(row.queue_number ?? '').split('-')[1] ?? '0', 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `A-${String(maxNumber + 1).padStart(3, '0')}`;
}

async function findOrCreatePatient(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  formData: VerifyRegistrationRequest['formData']
) {
  const { data: existingPatient, error: selectError } = await supabase
    .from('patients')
    .select('*')
    .eq('first_name', formData.firstName)
    .eq('last_name', formData.lastName)
    .eq('birth_date', formData.birthDate)
    .eq('contact_number', formData.contactNumber)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingPatient) {
    const { data: updatedPatient, error: updateError } = await supabase
      .from('patients')
      .update({
        middle_name: formData.middleName || null,
        company: formData.company || null,
        gender: formData.gender.toLowerCase(),
        email_address: formData.emailAddress || null,
        street_address: formData.streetAddress || null,
        city: formData.city || null,
        province: formData.province || null,
        notes: formData.notes || null,
      })
      .eq('id', existingPatient.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return updatedPatient;
  }

  const { data: createdPatient, error: createError } = await supabase
    .from('patients')
    .insert({
      patient_code: createCode('PAT'),
      first_name: formData.firstName,
      middle_name: formData.middleName || null,
      last_name: formData.lastName,
      company: formData.company || null,
      birth_date: formData.birthDate,
      gender: formData.gender.toLowerCase(),
      contact_number: formData.contactNumber || null,
      email_address: formData.emailAddress || null,
      street_address: formData.streetAddress || null,
      city: formData.city || null,
      province: formData.province || null,
      notes: formData.notes || null,
    })
    .select()
    .single();

  if (createError) {
    throw createError;
  }

  return createdPatient;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRegistrationRequest;
    const { registrationId, formData } = body;
    const supabase = getSupabaseAdminClient();

    const patient = await findOrCreatePatient(supabase, formData);

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .insert({
        visit_code: createCode('VIS'),
        patient_id: patient.id,
        registration_id: registrationId ?? null,
        service_type: toDbService(formData.serviceNeeded),
        requested_lab_service: toDbLabService(formData.requestedLabService),
        current_lane: 'general',
        notes: formData.notes || null,
      })
      .select()
      .single();

    if (visitError) {
      throw visitError;
    }

    const queueNumber = await getNextQueueNumber(supabase);
    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .insert({
        queue_number: queueNumber,
        visit_id: visit.id,
        patient_id: patient.id,
        service_type: toDbQueueService(formData.serviceNeeded),
        requested_lab_service: toDbLabService(formData.requestedLabService),
        current_lane: 'general',
        queue_status: 'waiting',
        counter_name: 'General Intake',
        priority_lane: false,
      })
      .select()
      .single();

    if (queueError) {
      throw queueError;
    }

    const queueSteps = buildDbQueueSteps(formData.serviceNeeded, formData.requestedLabService).map(
      (step) => ({
        visit_id: visit.id,
        queue_entry_id: queueEntry.id,
        lane: step.lane,
        sort_order: step.sort_order,
        is_required: step.is_required,
      })
    );

    const { error: stepsError } = await supabase.from('queue_steps').insert(queueSteps);

    if (stepsError) {
      throw stepsError;
    }

    if (formData.serviceNeeded === 'Check-Up') {
      const { error: consultationError } = await supabase.from('consultations').insert({
        visit_id: visit.id,
        queue_entry_id: queueEntry.id,
        status: 'pending',
      });

      if (consultationError) {
        throw consultationError;
      }
    }

    if (formData.serviceNeeded === 'Pre-Employment' || formData.serviceNeeded === 'Lab') {
      const nextLabOrderNumber = await getNextLabOrderNumber(supabase);

      const { data: labOrder, error: labOrderError } = await supabase
        .from('lab_orders')
        .insert({
          order_number: nextLabOrderNumber,
          visit_id: visit.id,
          patient_id: patient.id,
          source:
            formData.serviceNeeded === 'Pre-Employment'
              ? 'system_pre_employment'
              : 'direct_lab',
          status: 'ordered',
        })
        .select()
        .single();

      if (labOrderError) {
        throw labOrderError;
      }

      const labItems =
        formData.serviceNeeded === 'Pre-Employment'
          ? [
              {
                service_lane: 'blood_test',
                requested_lab_service: 'blood_test',
                test_code: 'PRE-BLOOD',
                test_name: 'Pre-Employment Blood Test',
              },
              {
                service_lane: 'drug_test',
                requested_lab_service: 'drug_test',
                test_code: 'PRE-DRUG',
                test_name: 'Pre-Employment Drug Test',
              },
              {
                service_lane: 'xray',
                requested_lab_service: 'xray',
                test_code: 'PRE-XRAY',
                test_name: 'Pre-Employment Xray',
              },
            ]
          : [
              {
                service_lane: toDbLabService(formData.requestedLabService),
                requested_lab_service: toDbLabService(formData.requestedLabService),
                test_code: `LAB-${String(toDbLabService(formData.requestedLabService) ?? 'blood_test').toUpperCase()}`,
                test_name: `${formData.requestedLabService || 'Blood Test'} Service`,
              },
            ];

      const { error: labItemsError } = await supabase.from('lab_order_items').insert(
        labItems
          .filter(
            (
              item
            ): item is {
              service_lane: 'blood_test' | 'drug_test' | 'xray';
              requested_lab_service: 'blood_test' | 'drug_test' | 'xray';
              test_code: string;
              test_name: string;
            } => Boolean(item.service_lane && item.requested_lab_service)
          )
          .map((item, index) => ({
            lab_order_id: labOrder.id,
            service_lane: item.service_lane,
            requested_lab_service: item.requested_lab_service,
            test_code: item.test_code,
            test_name: item.test_name,
            sample_id: createCode(`SMP${index + 1}`),
          }))
      );

      if (labItemsError) {
        throw labItemsError;
      }
    }

    if (registrationId) {
      const { error: registrationError } = await supabase
        .from('self_registrations')
        .update({
          patient_id: patient.id,
          status: 'verified',
          verified_at: new Date().toISOString(),
        })
        .eq('id', registrationId);

      if (registrationError) {
        throw registrationError;
      }
    }

    const fullName = [formData.firstName, formData.middleName, formData.lastName]
      .filter(Boolean)
      .join(' ');

    return NextResponse.json({
      patient: {
        id: patient.id,
        firstName: formData.firstName,
        middleName: formData.middleName,
        lastName: formData.lastName,
        company: formData.company,
        birthDate: formData.birthDate,
        gender: formData.gender,
        contactNumber: formData.contactNumber,
        emailAddress: formData.emailAddress,
        streetAddress: formData.streetAddress,
        city: formData.city,
        province: formData.province,
        notes: formData.notes,
      },
      queueEntry: {
        id: queueEntry.id,
        queueNumber,
        patientName: fullName,
        serviceType: toLocalQueueService(formData.serviceNeeded),
        requestedLabLane: toLocalRequestedLane(formData.requestedLabService),
        currentLane: 'GENERAL',
        pendingLanes: buildPendingLanes(formData.serviceNeeded, formData.requestedLabService),
        completedLanes: [],
        priority: false,
        counter: 'General Intake',
        status: 'waiting',
        createdAt: queueEntry.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getReadableVerifyError(error),
      },
      { status: 500 }
    );
  }
}
