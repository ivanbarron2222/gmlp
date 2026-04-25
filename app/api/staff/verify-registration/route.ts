import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { findMatchingPatient, getDoctorAssignmentSuggestion } from '@/lib/doctor-assignment';

type ServiceNeeded = 'Pre-Employment' | 'Check-Up' | 'Lab';
type RequestedLabService = 'Blood Test' | 'Drug Test' | 'Xray' | 'ECG' | '';
type LabLane = 'blood_test' | 'drug_test' | 'xray' | 'ecg';

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
    selectedServiceCodes?: string[];
    assignedDoctorId?: string | null;
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

    if (
      maybeError.code === '23514' &&
      message.includes('lab_order_items_lane_check')
    ) {
      return 'The database is still missing ECG lane support. Run the latest ECG migration, then try verifying again.';
    }

    if (
      maybeError.code === '22P02' &&
      (message.includes('queue_lane') || message.includes('lab_service_type') || message.includes('app_role'))
    ) {
      return 'The database enums are behind the app. Run the latest ECG/encoder migration, then try again.';
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
    case 'ECG':
      return 'ecg';
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
    case 'ECG':
      return 'ECG';
    default:
      return undefined;
  }
}

function laneToLocalRequestedLane(lane: LabLane) {
  switch (lane) {
    case 'blood_test':
      return 'BLOOD TEST';
    case 'drug_test':
      return 'DRUG TEST';
    case 'xray':
      return 'XRAY';
    case 'ecg':
      return 'ECG';
  }
}

function laneToRequestedLabService(lane: LabLane): RequestedLabService {
  switch (lane) {
    case 'blood_test':
      return 'Blood Test';
    case 'drug_test':
      return 'Drug Test';
    case 'xray':
      return 'Xray';
    case 'ecg':
      return 'ECG';
  }
}

function serviceCodeToLane(serviceCode: string): LabLane | null {
  const normalized = serviceCode.toLowerCase();
  if (normalized.includes('drug')) return 'drug_test';
  if (normalized.includes('xray') || normalized.includes('x-ray')) return 'xray';
  if (normalized.includes('ecg')) return 'ecg';
  if (normalized.includes('blood') || normalized.includes('cbc') || normalized.includes('urinalysis')) return 'blood_test';
  return null;
}

function requestedLabServiceToServiceCode(service: RequestedLabService) {
  switch (service) {
    case 'Blood Test':
      return 'svc-blood-test';
    case 'Drug Test':
      return 'svc-drug-test';
    case 'Xray':
      return 'svc-xray';
    case 'ECG':
      return 'svc-ecg';
    default:
      return 'svc-blood-test';
  }
}

function getDefaultServiceCodes(service: ServiceNeeded, requestedLabService: RequestedLabService) {
  if (service === 'Pre-Employment') {
    return ['svc-blood-test', 'svc-drug-test', 'svc-xray'];
  }

  if (service === 'Lab') {
    return [requestedLabServiceToServiceCode(requestedLabService)];
  }

  return [];
}

async function resolveSelectedLabServices(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  formData: VerifyRegistrationRequest['formData']
) {
  const selectedCodes = Array.from(
    new Set(
      (formData.selectedServiceCodes?.length
        ? formData.selectedServiceCodes
        : getDefaultServiceCodes(formData.serviceNeeded, formData.requestedLabService)
      )
        .map((code) => String(code).trim())
        .filter(Boolean)
    )
  );

  if (!selectedCodes.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('service_catalog')
    .select('service_code, service_name, service_lane')
    .in('service_code', selectedCodes);

  if (error) {
    throw error;
  }

  const servicesByCode = new Map((data ?? []).map((service) => [String(service.service_code), service]));

  return selectedCodes
    .map((serviceCode) => {
      const service = servicesByCode.get(serviceCode);
      const lane = (service?.service_lane ? String(service.service_lane) : serviceCodeToLane(serviceCode)) as LabLane | null;

      if (!lane) {
        return null;
      }

      return {
        serviceCode,
        lane,
        testCode: serviceCode.replace(/^svc-/i, '').toUpperCase(),
        testName: String(service?.service_name ?? serviceCode.replace(/^svc-/i, '').replaceAll('-', ' ')),
      };
    })
    .filter(
      (item): item is { serviceCode: string; lane: LabLane; testCode: string; testName: string } =>
        Boolean(item)
    );
}

function buildPendingLanes(
  service: ServiceNeeded,
  requestedLabService: RequestedLabService,
  selectedLabServices: Array<{ lane: LabLane }> = []
): Array<'BLOOD TEST' | 'DRUG TEST' | 'DOCTOR' | 'XRAY' | 'ECG'> {
  if ((service === 'Pre-Employment' || service === 'Lab') && selectedLabServices.length > 0) {
    const labLanes = Array.from(new Set(selectedLabServices.map((item) => laneToLocalRequestedLane(item.lane))));
    return service === 'Pre-Employment' ? [...labLanes, 'DOCTOR'] : labLanes;
  }

  switch (service) {
    case 'Pre-Employment':
      return ['BLOOD TEST', 'DRUG TEST', 'XRAY', 'DOCTOR'];
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
  requestedLabService: RequestedLabService,
  selectedLabServices: Array<{ lane: LabLane }> = []
) {
  if ((service === 'Pre-Employment' || service === 'Lab') && selectedLabServices.length > 0) {
    const lanes = Array.from(new Set(selectedLabServices.map((item) => item.lane)));
    const steps = lanes.map((lane, index) => ({ lane, sort_order: index + 1, is_required: true }));
    return service === 'Pre-Employment'
      ? [...steps, { lane: 'doctor', sort_order: steps.length + 1, is_required: true }]
      : steps;
  }

  switch (service) {
    case 'Pre-Employment':
      return [
        { lane: 'blood_test', sort_order: 1, is_required: true },
        { lane: 'drug_test', sort_order: 2, is_required: true },
        { lane: 'xray', sort_order: 3, is_required: true },
        { lane: 'doctor', sort_order: 4, is_required: true },
      ];
    case 'Check-Up':
      return [{ lane: 'doctor', sort_order: 1, is_required: true }];
    case 'Lab': {
      const requestedLane = toDbLabService(requestedLabService) ?? 'blood_test';
      return [{ lane: requestedLane, sort_order: 1, is_required: true }];
    }
  }
}

function getQueuePrefix(service: ServiceNeeded) {
  switch (service) {
    case 'Pre-Employment':
      return 'P';
    case 'Check-Up':
      return 'C';
    case 'Lab':
      return 'L';
  }
}

async function getNextQueueNumber(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  service: ServiceNeeded
) {
  const { startIso, endIso } = getManilaDayRange();
  const prefix = getQueuePrefix(service);
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
    const [currentPrefix, numeric] = String(row.queue_number ?? '').split('-');

    if (currentPrefix !== prefix) {
      return highest;
    }

    const value = Number.parseInt(numeric ?? '0', 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `${prefix}-${String(maxNumber + 1).padStart(3, '0')}`;
}

async function assertPendingRegistrationIsOpen(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  registrationId?: string | null
) {
  if (!registrationId) {
    return;
  }

  const { data, error } = await supabase
    .from('self_registrations')
    .select('id, status, registration_code')
    .eq('id', registrationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Registration record was not found.');
  }

  if (data.status !== 'pending') {
    throw new Error(`Registration ${data.registration_code} was already processed.`);
  }
}

async function assertNoActiveVisitToday(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  patientId: string
) {
  const { startIso, endIso } = getManilaDayRange();
  const { data, error } = await supabase
    .from('visits')
    .select('id, visit_code')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .limit(1);

  if (error) {
    throw error;
  }

  const activeVisit = data?.[0];
  if (activeVisit) {
    throw new Error(`This patient already has an active visit today. Visit code: ${activeVisit.visit_code}.`);
  }
}

async function findOrCreatePatient(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  formData: VerifyRegistrationRequest['formData']
) {
  const matchedPatient = await findMatchingPatient(supabase, {
    firstName: formData.firstName,
    middleName: formData.middleName,
    lastName: formData.lastName,
    birthDate: formData.birthDate,
    contactNumber: formData.contactNumber,
    emailAddress: formData.emailAddress,
  });

  let existingPatient: Record<string, unknown> | null = null;

  if (matchedPatient?.id) {
    const { data: patientRow, error: selectError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', matchedPatient.id)
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    existingPatient = patientRow;
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
    let assignedDoctorId = formData.assignedDoctorId || null;

    await assertPendingRegistrationIsOpen(supabase, registrationId);

    if (formData.serviceNeeded === 'Check-Up' && !assignedDoctorId) {
      const assignment = await getDoctorAssignmentSuggestion(supabase, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        birthDate: formData.birthDate,
        contactNumber: formData.contactNumber,
        emailAddress: formData.emailAddress,
      });

      assignedDoctorId = assignment.preferredDoctorId;
    }

    const patient = await findOrCreatePatient(supabase, formData);
    await assertNoActiveVisitToday(supabase, String(patient.id));
    const selectedLabServices = await resolveSelectedLabServices(supabase, formData);
    const requestedServiceCodes = selectedLabServices.map((service) => service.serviceCode);
    const primaryRequestedLabService =
      selectedLabServices[0]?.lane
        ? laneToRequestedLabService(selectedLabServices[0].lane)
        : formData.requestedLabService;
    const dbRequestedLabService =
      formData.serviceNeeded === 'Lab' ? toDbLabService(primaryRequestedLabService) : null;

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .insert({
        visit_code: createCode('VIS'),
        patient_id: patient.id,
        registration_id: registrationId ?? null,
        service_type: toDbService(formData.serviceNeeded),
        requested_lab_service: dbRequestedLabService,
        requested_service_codes: requestedServiceCodes,
        current_lane: 'general',
        notes: formData.notes || null,
      })
      .select()
      .single();

    if (visitError) {
      throw visitError;
    }

    const queueNumber = await getNextQueueNumber(supabase, formData.serviceNeeded);
    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .insert({
        queue_number: queueNumber,
        visit_id: visit.id,
        patient_id: patient.id,
        service_type: toDbQueueService(formData.serviceNeeded),
        requested_lab_service: dbRequestedLabService,
        requested_service_codes: requestedServiceCodes,
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

    const queueSteps = buildDbQueueSteps(formData.serviceNeeded, primaryRequestedLabService, selectedLabServices).map(
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
        doctor_directory_id: assignedDoctorId,
        status: 'pending',
      });

      if (consultationError) {
        throw consultationError;
      }
    }

    let createdLabNumbers: string[] = [];

    if (formData.serviceNeeded === 'Pre-Employment' || formData.serviceNeeded === 'Lab') {
      const nextLabOrderNumber = await getNextLabOrderNumber(supabase);
      createdLabNumbers = [nextLabOrderNumber];

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

      const labItems = selectedLabServices.length > 0
        ? selectedLabServices.map((service) => ({
            service_lane: service.lane,
            requested_lab_service: service.lane,
            test_code: service.testCode,
            test_name: service.testName,
          }))
        : [
            {
              service_lane: toDbLabService(primaryRequestedLabService),
              requested_lab_service: toDbLabService(primaryRequestedLabService),
              test_code: `LAB-${String(toDbLabService(primaryRequestedLabService) ?? 'blood_test').toUpperCase()}`,
              test_name: `${primaryRequestedLabService || 'Blood Test'} Service`,
            },
          ];

      const { error: labItemsError } = await supabase.from('lab_order_items').insert(
        labItems
          .filter(
            (
              item
            ): item is {
              service_lane: 'blood_test' | 'drug_test' | 'xray' | 'ecg';
              requested_lab_service: 'blood_test' | 'drug_test' | 'xray' | 'ecg';
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
    let assignedDoctorName: string | null = null;

    if (assignedDoctorId) {
      const { data: doctorProfile, error: doctorProfileError } = await supabase
        .from('doctors')
        .select('full_name')
        .eq('id', assignedDoctorId)
        .maybeSingle();

      if (doctorProfileError) {
        throw doctorProfileError;
      }

      assignedDoctorName = String(doctorProfile?.full_name ?? '');
    }

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
        requestedLabLane: toLocalRequestedLane(primaryRequestedLabService),
        currentLane: 'GENERAL',
        pendingLanes: buildPendingLanes(formData.serviceNeeded, primaryRequestedLabService, selectedLabServices),
        completedLanes: [],
        priority: false,
        counter: 'General Intake',
        status: 'waiting',
        createdAt: queueEntry.created_at,
        assignedDoctorId: assignedDoctorId || undefined,
        assignedDoctorName: assignedDoctorName || undefined,
      },
      labNumbers: createdLabNumbers,
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
