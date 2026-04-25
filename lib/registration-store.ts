'use client';

export type RegistrationService = 'Pre-Employment' | 'Check-Up' | 'Lab';
export type RequestedLabService = 'Blood Test' | 'Drug Test' | 'Xray' | 'ECG';

export interface PendingRegistration {
  id: string;
  registrationCode: string;
  submittedAt: string;
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
  serviceNeeded: RegistrationService;
  requestedLabService: RequestedLabService | '';
  selectedServiceCodes: string[];
  notes: string;
  status?: string;
  queueEntry?: {
    id: string;
    queueNumber: string;
    patientName: string;
    serviceType: 'PRE-EMPLOYMENT' | 'CHECK-UP' | 'LAB';
    requestedLabLane?: 'BLOOD TEST' | 'DRUG TEST' | 'XRAY' | 'ECG';
    currentLane: 'GENERAL' | 'BLOOD TEST' | 'DRUG TEST' | 'DOCTOR' | 'XRAY' | 'ECG';
    pendingLanes: Array<'GENERAL' | 'BLOOD TEST' | 'DRUG TEST' | 'DOCTOR' | 'XRAY' | 'ECG'>;
    completedLanes: Array<'GENERAL' | 'BLOOD TEST' | 'DRUG TEST' | 'DOCTOR' | 'XRAY' | 'ECG'>;
    priority: boolean;
    counter: string;
    status: 'waiting' | 'serving' | 'missed' | 'requeue_required' | 'completed';
    createdAt: string;
  } | null;
  labNumbers?: string[];
}

export interface RegistrationFormInput {
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
  serviceNeeded: RegistrationService;
  requestedLabService: RequestedLabService | '';
  selectedServiceCodes: string[];
  notes: string;
}

const STORAGE_KEY = 'gmlp-pending-registrations-v1';

function mapDbRegistration(row: Record<string, unknown>): PendingRegistration {
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

export function readPendingRegistrations(): PendingRegistration[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PendingRegistration[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

export function writePendingRegistrations(registrations: PendingRegistration[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registrations));
}

export async function addPendingRegistration(registration: RegistrationFormInput) {
  const response = await fetch('/api/public/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(registration),
  });

  const payload = (await response.json().catch(() => null)) as
    | { registration?: PendingRegistration; error?: string }
    | null;

  if (!response.ok || !payload?.registration) {
    throw new Error(payload?.error ?? 'Unable to submit registration right now.');
  }

  return payload.registration;
}

export async function fetchPendingRegistrations() {
  const response = await fetch('/api/staff/pending-registrations', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load pending registrations.');
  }

  const payload = (await response.json()) as { registrations: PendingRegistration[] };
  writePendingRegistrations(payload.registrations);
  return payload.registrations;
}
