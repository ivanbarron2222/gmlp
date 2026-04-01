import type { BillingRecord } from '@/lib/billing';
import type { QueueEntry } from '@/lib/queue-store';

export type VisitServiceType = 'Pre-Employment' | 'Check-Up' | 'Lab';

export interface MachineResultItem {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: string;
}

export interface MachineResultImport {
  id: string;
  lane: 'BLOOD TEST' | 'DRUG TEST' | 'XRAY';
  importedAt: string;
  orderId: string;
  patientName: string;
  testName: string;
  rawText: string;
  results: MachineResultItem[];
}

export interface VisitRecord {
  id: string;
  queueEntryId: string;
  queueNumber: string;
  labNumbers: string[];
  patientName: string;
  serviceType: VisitServiceType;
  requestedLabService: string;
  notes: string;
  currentLane: QueueEntry['currentLane'];
  pendingLanes: QueueEntry['pendingLanes'];
  completedLanes: QueueEntry['completedLanes'];
  queueStatus: QueueEntry['status'];
  visitStatus: 'queued' | 'in-progress' | 'awaiting-payment' | 'paid' | 'completed';
  createdAt: string;
  updatedAt: string;
  billing: BillingRecord | null;
  machineResults: MachineResultImport[];
}

export interface PatientRecord {
  id: string;
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
  createdAt: string;
  visits: VisitRecord[];
}
