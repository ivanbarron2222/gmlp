'use client';

import { QueueEntry } from '@/lib/queue-store';
import type { BillingLineItem, BillingPaymentMethod, BillingRecord } from '@/lib/billing';
import type {
  MachineResultImport,
  PatientRecord,
  VisitRecord,
  VisitServiceType,
} from '@/lib/patient-record-types';

export type { BillingLineItem, BillingPaymentMethod, BillingRecord } from '@/lib/billing';
export type {
  MachineResultImport,
  PatientRecord,
  VisitRecord,
  VisitServiceType,
} from '@/lib/patient-record-types';

export interface CreatePatientVisitInput {
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
  notes: string;
  serviceNeeded: VisitServiceType;
  requestedLabService: string;
}

const STORAGE_KEY = 'gmlp-patient-records-v1';

function normalizeVisitRecord(visit: Partial<VisitRecord>): VisitRecord {
  return {
    id: visit.id ?? `visit-${Date.now()}`,
    queueEntryId: visit.queueEntryId ?? '',
    queueNumber: visit.queueNumber ?? '',
    patientName: visit.patientName ?? '',
    serviceType: visit.serviceType ?? 'Check-Up',
    requestedLabService: visit.requestedLabService ?? '',
    notes: visit.notes ?? '',
    currentLane: visit.currentLane ?? 'GENERAL',
    pendingLanes: Array.isArray(visit.pendingLanes) ? visit.pendingLanes : [],
    completedLanes: Array.isArray(visit.completedLanes) ? visit.completedLanes : [],
    queueStatus: visit.queueStatus ?? 'waiting',
    visitStatus: visit.visitStatus ?? 'queued',
    createdAt: visit.createdAt ?? new Date().toISOString(),
    updatedAt: visit.updatedAt ?? new Date().toISOString(),
    billing: visit.billing ?? null,
    machineResults: Array.isArray(visit.machineResults) ? visit.machineResults : [],
  };
}

function normalizePatientRecord(record: Partial<PatientRecord>): PatientRecord {
  return {
    id: record.id ?? `patient-${Date.now()}`,
    firstName: record.firstName ?? '',
    middleName: record.middleName ?? '',
    lastName: record.lastName ?? '',
    company: record.company ?? '',
    birthDate: record.birthDate ?? '',
    gender: record.gender ?? '',
    contactNumber: record.contactNumber ?? '',
    emailAddress: record.emailAddress ?? '',
    streetAddress: record.streetAddress ?? '',
    city: record.city ?? '',
    province: record.province ?? '',
    createdAt: record.createdAt ?? new Date().toISOString(),
    visits: Array.isArray(record.visits) ? record.visits.map((visit) => normalizeVisitRecord(visit)) : [],
  };
}

export function readPatientRecords(): PatientRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PatientRecord>[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed.map((record) => normalizePatientRecord(record));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

export function writePatientRecords(records: PatientRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function buildPatientKey(input: Pick<CreatePatientVisitInput, 'firstName' | 'lastName' | 'birthDate' | 'contactNumber'>) {
  return `${input.firstName}|${input.lastName}|${input.birthDate}|${input.contactNumber}`.toLowerCase();
}

function buildVisitStatus(queueEntry: QueueEntry, currentBilling: BillingRecord | null) {
  if (currentBilling?.paymentStatus === 'paid') {
    return 'paid' as const;
  }

  if (queueEntry.status === 'completed') {
    return 'awaiting-payment' as const;
  }

  if (queueEntry.status === 'serving' || queueEntry.completedLanes.length > 0) {
    return 'in-progress' as const;
  }

  return 'queued' as const;
}

export function createPatientVisitRecord(
  input: CreatePatientVisitInput,
  queueEntry: QueueEntry
) {
  const records = readPatientRecords();
  const patientKey = buildPatientKey(input);
  const existingPatient = records.find(
    (record) =>
      buildPatientKey({
        firstName: record.firstName,
        lastName: record.lastName,
        birthDate: record.birthDate,
        contactNumber: record.contactNumber,
      }) === patientKey
  );

  const nextVisit: VisitRecord = {
    id: `visit-${Date.now()}`,
    queueEntryId: queueEntry.id,
    queueNumber: queueEntry.queueNumber,
    patientName: queueEntry.patientName,
    serviceType: input.serviceNeeded,
    requestedLabService: input.requestedLabService,
    notes: input.notes,
    currentLane: queueEntry.currentLane,
    pendingLanes: [...queueEntry.pendingLanes],
    completedLanes: [...queueEntry.completedLanes],
    queueStatus: queueEntry.status,
    visitStatus: buildVisitStatus(queueEntry, null),
    createdAt: queueEntry.createdAt,
    updatedAt: new Date().toISOString(),
    billing: null,
    machineResults: [],
  };

  if (existingPatient) {
    const nextRecords = records.map((record) =>
      record.id === existingPatient.id
        ? {
            ...record,
            middleName: input.middleName,
            company: input.company,
            gender: input.gender,
            emailAddress: input.emailAddress,
            streetAddress: input.streetAddress,
            city: input.city,
            province: input.province,
            visits: [nextVisit, ...record.visits],
          }
        : record
    );
    writePatientRecords(nextRecords);
    return nextVisit;
  }

  const nextPatient: PatientRecord = {
    id: `patient-${Date.now()}`,
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    company: input.company,
    birthDate: input.birthDate,
    gender: input.gender,
    contactNumber: input.contactNumber,
    emailAddress: input.emailAddress,
    streetAddress: input.streetAddress,
    city: input.city,
    province: input.province,
    createdAt: new Date().toISOString(),
    visits: [nextVisit],
  };

  writePatientRecords([nextPatient, ...records]);
  return nextVisit;
}

export function syncVisitRecordFromQueueEntry(queueEntry: QueueEntry) {
  const records = readPatientRecords();
  const nextRecords = records.map((patient) => ({
    ...patient,
    visits: patient.visits.map((visit) =>
      visit.queueEntryId === queueEntry.id
        ? {
            ...visit,
            queueNumber: queueEntry.queueNumber,
            patientName: queueEntry.patientName,
            currentLane: queueEntry.currentLane,
            pendingLanes: [...queueEntry.pendingLanes],
            completedLanes: [...queueEntry.completedLanes],
            queueStatus: queueEntry.status,
            visitStatus: buildVisitStatus(queueEntry, visit.billing),
            updatedAt: new Date().toISOString(),
          }
        : visit
    ),
  }));

  writePatientRecords(nextRecords);
}

export function findVisitByQueueEntryId(queueEntryId: string) {
  const records = readPatientRecords();

  for (const patient of records) {
    const visit = patient.visits.find((item) => item.queueEntryId === queueEntryId);

    if (visit) {
      return {
        patient,
        visit,
      };
    }
  }

  return null;
}

export function saveVisitBilling(queueEntryId: string, billing: BillingRecord) {
  const records = readPatientRecords();
  const nextVisitStatus: VisitRecord['visitStatus'] =
    billing.paymentStatus === 'paid' ? 'paid' : 'awaiting-payment';

  const nextRecords = records.map((patient) => ({
    ...patient,
    visits: patient.visits.map((visit) =>
      visit.queueEntryId === queueEntryId
        ? {
            ...visit,
            billing,
            visitStatus: nextVisitStatus,
            updatedAt: new Date().toISOString(),
          }
        : visit
    ),
  }));

  writePatientRecords(nextRecords);
  return findVisitByQueueEntryId(queueEntryId);
}

export function saveVisitMachineResult(
  queueEntryId: string,
  machineResult: MachineResultImport
) {
  const records = readPatientRecords();
  const nextRecords = records.map((patient) => ({
    ...patient,
    visits: patient.visits.map((visit) =>
      visit.queueEntryId === queueEntryId
        ? {
            ...visit,
            machineResults: [
              machineResult,
              ...visit.machineResults.filter((item) => item.lane !== machineResult.lane),
            ],
            updatedAt: new Date().toISOString(),
          }
        : visit
    ),
  }));

  writePatientRecords(nextRecords);
  return findVisitByQueueEntryId(queueEntryId);
}
