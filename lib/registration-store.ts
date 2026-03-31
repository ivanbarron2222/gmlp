'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type RegistrationService = 'Pre-Employment' | 'Check-Up' | 'Lab';
export type RequestedLabService = 'Blood Test' | 'Drug Test' | 'Xray';

export interface PendingRegistration {
  id: string;
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
  notes: string;
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
  notes: string;
}

const STORAGE_KEY = 'gmlp-pending-registrations-v1';

function mapDbRegistration(row: Record<string, unknown>): PendingRegistration {
  return {
    id: String(row.id),
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
            : '',
    notes: String(row.notes ?? ''),
  };
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
    default:
      return null;
  }
}

function buildRegistrationCode() {
  return `REG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    const nextRegistration: PendingRegistration = {
      ...registration,
      id: `reg-${Date.now()}`,
      submittedAt: new Date().toISOString(),
    };

    writePendingRegistrations([nextRegistration, ...readPendingRegistrations()]);
    return nextRegistration;
  }

  const { data, error } = await supabase
    .from('self_registrations')
    .insert({
      registration_code: buildRegistrationCode(),
      first_name: registration.firstName,
      middle_name: registration.middleName || null,
      last_name: registration.lastName,
      company: registration.company || null,
      birth_date: registration.birthDate,
      gender: registration.gender.toLowerCase(),
      contact_number: registration.contactNumber || null,
      email_address: registration.emailAddress || null,
      street_address: registration.streetAddress || null,
      city: registration.city || null,
      province: registration.province || null,
      service_needed: toDbService(registration.serviceNeeded),
      requested_lab_service: toDbLabService(registration.requestedLabService),
      notes: registration.notes || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDbRegistration(data as Record<string, unknown>);
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
