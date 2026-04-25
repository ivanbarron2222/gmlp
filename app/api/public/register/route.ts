import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { findMatchingPatient } from '@/lib/doctor-assignment';
import type { RegistrationFormInput, RegistrationService, RequestedLabService } from '@/lib/registration-store';

type LabLane = 'blood_test' | 'drug_test' | 'xray' | 'ecg';

function buildRegistrationCode() {
  return `REG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
    manilaDate,
  };
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toDbService(service: RegistrationService) {
  switch (service) {
    case 'Pre-Employment':
      return 'pre_employment';
    case 'Check-Up':
      return 'check_up';
    case 'Lab':
      return 'lab';
  }
}

function toDbLabService(service: RequestedLabService | '') {
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

function toLocalQueueService(service: RegistrationService) {
  switch (service) {
    case 'Pre-Employment':
      return 'PRE-EMPLOYMENT';
    case 'Check-Up':
      return 'CHECK-UP';
    case 'Lab':
      return 'LAB';
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

function requestedLabServiceToServiceCode(service: RequestedLabService | '') {
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

function getDefaultServiceCodes(service: RegistrationService, requestedLabService: RequestedLabService | '') {
  if (service === 'Pre-Employment') {
    return ['svc-blood-test', 'svc-drug-test', 'svc-xray'];
  }

  if (service === 'Lab') {
    return [requestedLabServiceToServiceCode(requestedLabService)];
  }

  return [];
}

function getQueuePrefix(service: RegistrationService) {
  switch (service) {
    case 'Pre-Employment':
      return 'P';
    case 'Check-Up':
      return 'C';
    case 'Lab':
      return 'L';
  }
}

function validateRegistration(input: RegistrationFormInput) {
  const firstName = normalizeText(input.firstName);
  const lastName = normalizeText(input.lastName);
  const birthDate = normalizeText(input.birthDate);
  const emailAddress = normalizeEmail(input.emailAddress);
  const contactNumber = normalizeText(input.contactNumber);
  const serviceNeeded = normalizeText(input.serviceNeeded) as RegistrationService;
  const selectedServiceCodes = Array.isArray(input.selectedServiceCodes)
    ? input.selectedServiceCodes.map(normalizeText).filter(Boolean)
    : [];

  if (!firstName || !lastName || !birthDate || !emailAddress || !contactNumber || !serviceNeeded) {
    throw new Error('Name, birth date, email, contact number, and service are required.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
    throw new Error('Enter a valid email address.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(new Date(`${birthDate}T00:00:00`).getTime())) {
    throw new Error('Enter a valid birth date.');
  }

  if (!['Pre-Employment', 'Check-Up', 'Lab'].includes(serviceNeeded)) {
    throw new Error('Select a valid service.');
  }

  if ((serviceNeeded === 'Pre-Employment' || serviceNeeded === 'Lab') && selectedServiceCodes.length === 0) {
    throw new Error('Please select at least one lab test.');
  }

  if (serviceNeeded === 'Lab' && !toDbLabService(input.requestedLabService)) {
    throw new Error('Select a valid lab test.');
  }

  return {
    ...input,
    firstName,
    middleName: normalizeText(input.middleName),
    lastName,
    company: normalizeText(input.company),
    birthDate,
    gender: normalizeText(input.gender).toLowerCase(),
    contactNumber,
    emailAddress,
    streetAddress: normalizeText(input.streetAddress),
    city: normalizeText(input.city),
    province: normalizeText(input.province),
    serviceNeeded,
    requestedLabService: serviceNeeded === 'Lab' ? input.requestedLabService : '',
    selectedServiceCodes,
    notes: normalizeText(input.notes),
  };
}

async function assertNoSameDayPendingRegistration(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: ReturnType<typeof validateRegistration>
) {
  const { startIso, endIso } = getManilaDayRange();
  const { data, error } = await supabase
    .from('self_registrations')
    .select('id, registration_code, created_at')
    .eq('status', 'pending')
    .ilike('first_name', input.firstName)
    .ilike('last_name', input.lastName)
    .eq('birth_date', input.birthDate)
    .ilike('email_address', input.emailAddress)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const existing = data?.[0];
  if (existing) {
    throw new Error(`You already have a pending registration today. Reference code: ${existing.registration_code}.`);
  }
}

async function assertNoSameDayActiveVisit(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: ReturnType<typeof validateRegistration>
) {
  const { startIso, endIso } = getManilaDayRange();
  const { data: patients, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .ilike('first_name', input.firstName)
    .ilike('last_name', input.lastName)
    .eq('birth_date', input.birthDate)
    .ilike('email_address', input.emailAddress)
    .limit(10);

  if (patientError) {
    throw patientError;
  }

  const patientIds = (patients ?? []).map((patient) => String(patient.id));
  if (!patientIds.length) {
    return;
  }

  const { data: visits, error: visitError } = await supabase
    .from('visits')
    .select('id, visit_code')
    .eq('status', 'active')
    .in('patient_id', patientIds)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .limit(1);

  if (visitError) {
    throw visitError;
  }

  const activeVisit = visits?.[0];
  if (activeVisit) {
    throw new Error(`You already have an active visit today. Visit code: ${activeVisit.visit_code}.`);
  }
}

async function getNextQueueNumber(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  service: RegistrationService
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
    if (currentPrefix !== prefix) return highest;
    const value = Number.parseInt(numeric ?? '0', 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `${prefix}-${String(maxNumber + 1).padStart(3, '0')}`;
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
    if (!match) return highest;
    const value = Number.parseInt(match[1] ?? '0', 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `LAB-${String(maxNumber + 1).padStart(3, '0')}`;
}

async function resolveSelectedLabServices(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: ReturnType<typeof validateRegistration>
) {
  const selectedCodes = Array.from(
    new Set(
      (input.selectedServiceCodes.length
        ? input.selectedServiceCodes
        : getDefaultServiceCodes(input.serviceNeeded, input.requestedLabService)
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
      if (!lane) return null;

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

function buildDbQueueSteps(
  service: RegistrationService,
  selectedLabServices: Array<{ lane: LabLane }>
) {
  if (service === 'Pre-Employment') {
    const labSteps = Array.from(new Set(selectedLabServices.map((item) => item.lane))).map((lane, index) => ({
      lane,
      sort_order: index + 1,
      is_required: true,
    }));
    return [...labSteps, { lane: 'doctor', sort_order: labSteps.length + 1, is_required: true }];
  }

  if (service === 'Lab') {
    return Array.from(new Set(selectedLabServices.map((item) => item.lane))).map((lane, index) => ({
      lane,
      sort_order: index + 1,
      is_required: true,
    }));
  }

  return [{ lane: 'doctor', sort_order: 1, is_required: true }];
}

function buildPendingLanes(service: RegistrationService, selectedLabServices: Array<{ lane: LabLane }>) {
  const labLanes = Array.from(new Set(selectedLabServices.map((item) => laneToLocalRequestedLane(item.lane))));
  if (service === 'Pre-Employment') {
    return [...labLanes, 'DOCTOR'];
  }

  if (service === 'Lab') {
    return labLanes;
  }

  return ['DOCTOR'];
}

async function findOrCreatePatient(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: ReturnType<typeof validateRegistration>
) {
  const matchedPatient = await findMatchingPatient(supabase, {
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    birthDate: input.birthDate,
    contactNumber: input.contactNumber,
    emailAddress: input.emailAddress,
  });

  if (matchedPatient?.id) {
    const { data: updatedPatient, error } = await supabase
      .from('patients')
      .update({
        middle_name: input.middleName || null,
        company: input.company || null,
        gender: input.gender,
        contact_number: input.contactNumber || null,
        email_address: input.emailAddress || null,
        street_address: input.streetAddress || null,
        city: input.city || null,
        province: input.province || null,
        notes: input.notes || null,
      })
      .eq('id', matchedPatient.id)
      .select()
      .single();

    if (error) throw error;
    return updatedPatient;
  }

  const { data: createdPatient, error } = await supabase
    .from('patients')
    .insert({
      patient_code: createCode('PAT'),
      first_name: input.firstName,
      middle_name: input.middleName || null,
      last_name: input.lastName,
      company: input.company || null,
      birth_date: input.birthDate,
      gender: input.gender,
      contact_number: input.contactNumber || null,
      email_address: input.emailAddress || null,
      street_address: input.streetAddress || null,
      city: input.city || null,
      province: input.province || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return createdPatient;
}

export async function POST(request: Request) {
  try {
    const input = validateRegistration((await request.json()) as RegistrationFormInput);
    const supabase = getSupabaseAdminClient();

    await assertNoSameDayPendingRegistration(supabase, input);
    await assertNoSameDayActiveVisit(supabase, input);

    const registrationCode = buildRegistrationCode();
    const { data, error } = await supabase
      .from('self_registrations')
      .insert({
        registration_code: registrationCode,
        first_name: input.firstName,
        middle_name: input.middleName || null,
        last_name: input.lastName,
        company: input.company || null,
        birth_date: input.birthDate,
        gender: input.gender,
        contact_number: input.contactNumber,
        email_address: input.emailAddress,
        street_address: input.streetAddress || null,
        city: input.city || null,
        province: input.province || null,
        service_needed: toDbService(input.serviceNeeded),
        requested_lab_service: toDbLabService(input.requestedLabService),
        requested_service_codes: input.selectedServiceCodes,
        notes: input.notes || null,
      })
      .select('id, registration_code, created_at')
      .single();

    if (error) {
      throw error;
    }

    const patient = await findOrCreatePatient(supabase, input);
    const selectedLabServices = await resolveSelectedLabServices(supabase, input);
    const requestedServiceCodes = selectedLabServices.map((service) => service.serviceCode);
    const primaryRequestedLabService =
      selectedLabServices[0]?.lane ? laneToRequestedLabService(selectedLabServices[0].lane) : input.requestedLabService;
    const dbRequestedLabService = input.serviceNeeded === 'Lab' ? toDbLabService(primaryRequestedLabService) : null;

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .insert({
        visit_code: createCode('VIS'),
        patient_id: patient.id,
        registration_id: data.id,
        service_type: toDbService(input.serviceNeeded),
        requested_lab_service: dbRequestedLabService,
        requested_service_codes: requestedServiceCodes,
        current_lane: 'general',
        notes: input.notes || null,
      })
      .select()
      .single();

    if (visitError) {
      throw visitError;
    }

    const queueNumber = await getNextQueueNumber(supabase, input.serviceNeeded);
    const { manilaDate } = getManilaDayRange();
    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .insert({
        queue_number: queueNumber,
        visit_id: visit.id,
        patient_id: patient.id,
        service_type: toDbService(input.serviceNeeded),
        requested_lab_service: dbRequestedLabService,
        requested_service_codes: requestedServiceCodes,
        current_lane: 'general',
        queue_status: 'waiting',
        counter_name: 'General Intake',
        priority_lane: false,
        queue_date: manilaDate,
      })
      .select()
      .single();

    if (queueError) {
      throw queueError;
    }

    const queueSteps = buildDbQueueSteps(input.serviceNeeded, selectedLabServices).map((step) => ({
      visit_id: visit.id,
      queue_entry_id: queueEntry.id,
      lane: step.lane,
      sort_order: step.sort_order,
      is_required: step.is_required,
    }));

    const { error: stepsError } = await supabase.from('queue_steps').insert(queueSteps);
    if (stepsError) {
      throw stepsError;
    }

    let createdLabNumbers: string[] = [];
    if (input.serviceNeeded === 'Pre-Employment' || input.serviceNeeded === 'Lab') {
      const nextLabOrderNumber = await getNextLabOrderNumber(supabase);
      createdLabNumbers = [nextLabOrderNumber];
      const { data: labOrder, error: labOrderError } = await supabase
        .from('lab_orders')
        .insert({
          order_number: nextLabOrderNumber,
          visit_id: visit.id,
          patient_id: patient.id,
          source: input.serviceNeeded === 'Pre-Employment' ? 'system_pre_employment' : 'direct_lab',
          status: 'ordered',
        })
        .select()
        .single();

      if (labOrderError) {
        throw labOrderError;
      }

      const { error: labItemsError } = await supabase.from('lab_order_items').insert(
        selectedLabServices.map((service, index) => ({
          lab_order_id: labOrder.id,
          service_lane: service.lane,
          requested_lab_service: service.lane,
          test_code: service.testCode,
          test_name: service.testName,
          sample_id: createCode(`SMP${index + 1}`),
        }))
      );

      if (labItemsError) {
        throw labItemsError;
      }
    }

    const { error: registrationUpdateError } = await supabase
      .from('self_registrations')
      .update({
        patient_id: patient.id,
        status: 'verified',
        verified_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    if (registrationUpdateError) {
      throw registrationUpdateError;
    }

    const fullName = [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' ');
    const pendingLanes = buildPendingLanes(input.serviceNeeded, selectedLabServices);

    return NextResponse.json({
      registration: {
        id: String(data.id),
        registrationCode: String(data.registration_code),
        submittedAt: String(data.created_at),
        status: 'verified',
        ...input,
        queueEntry: {
          id: String(queueEntry.id),
          queueNumber,
          patientName: fullName,
          serviceType: toLocalQueueService(input.serviceNeeded),
          requestedLabLane: selectedLabServices[0]?.lane ? laneToLocalRequestedLane(selectedLabServices[0].lane) : undefined,
          currentLane: 'GENERAL',
          pendingLanes,
          completedLanes: [],
          priority: false,
          counter: 'General Intake',
          status: 'waiting',
          createdAt: String(queueEntry.created_at),
        },
        labNumbers: createdLabNumbers,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to submit registration.' },
      { status: 400 }
    );
  }
}
