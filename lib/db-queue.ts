import type { QueueEntry, QueueLane, QueueStatus, ServiceType } from '@/lib/queue-store';

type DbServiceType = 'pre_employment' | 'check_up' | 'lab';
type DbQueueLane = 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray';
type DbQueueStatus = 'waiting' | 'now_serving' | 'completed' | 'cancelled' | 'skipped';
type DbQueueStepStatus = 'pending' | 'serving' | 'completed' | 'skipped' | 'cancelled';
type DbLabService = 'blood_test' | 'drug_test' | 'xray' | null;

export interface QueueEntryRow {
  id: string;
  queue_number: string;
  service_type: DbServiceType;
  requested_lab_service: DbLabService;
  current_lane: DbQueueLane;
  queue_status: DbQueueStatus;
  counter_name: string | null;
  priority_lane: boolean;
  created_at: string;
  now_serving_at: string | null;
  completed_at: string | null;
  patients:
    | {
        first_name: string;
        middle_name: string | null;
        last_name: string;
      }
    | Array<{
        first_name: string;
        middle_name: string | null;
        last_name: string;
      }>
    | null;
  queue_steps:
    | Array<{
        id: string;
        lane: DbQueueLane;
        status: DbQueueStepStatus;
        sort_order: number;
      }>
    | null;
}

export function dbLaneToUiLane(lane: DbQueueLane): QueueLane {
  switch (lane) {
    case 'blood_test':
      return 'BLOOD TEST';
    case 'drug_test':
      return 'DRUG TEST';
    case 'doctor':
      return 'DOCTOR';
    case 'xray':
      return 'XRAY';
    default:
      return 'GENERAL';
  }
}

export function uiLaneToDbLane(lane: QueueLane): DbQueueLane {
  switch (lane) {
    case 'BLOOD TEST':
      return 'blood_test';
    case 'DRUG TEST':
      return 'drug_test';
    case 'DOCTOR':
      return 'doctor';
    case 'XRAY':
      return 'xray';
    default:
      return 'general';
  }
}

export function dbServiceToUiService(service: DbServiceType): ServiceType {
  switch (service) {
    case 'pre_employment':
      return 'PRE-EMPLOYMENT';
    case 'check_up':
      return 'CHECK-UP';
    default:
      return 'LAB';
  }
}

export function dbStatusToUiStatus(status: DbQueueStatus): QueueStatus {
  switch (status) {
    case 'now_serving':
      return 'serving';
    case 'completed':
      return 'completed';
    default:
      return 'waiting';
  }
}

export function dbLabServiceToUiRequestedLane(service: DbLabService): QueueEntry['requestedLabLane'] {
  switch (service) {
    case 'blood_test':
      return 'BLOOD TEST';
    case 'drug_test':
      return 'DRUG TEST';
    case 'xray':
      return 'XRAY';
    default:
      return undefined;
  }
}

export function uiLaneLabel(lane: QueueLane, priority: boolean) {
  if (lane === 'GENERAL' && priority) {
    return 'Priority Lane';
  }

  if (lane === 'GENERAL') {
    return 'General Intake';
  }

  return lane;
}

export function toPatientFullName(
  patient:
    | QueueEntryRow['patients']
    | {
        first_name: string;
        middle_name: string | null;
        last_name: string;
      }
) {
  const normalized = Array.isArray(patient) ? patient[0] : patient;

  if (!normalized) {
    return 'Unknown Patient';
  }

  return [normalized.first_name, normalized.middle_name ?? '', normalized.last_name]
    .filter(Boolean)
    .join(' ');
}

export function mapQueueEntryRow(row: QueueEntryRow): QueueEntry {
  const steps = [...(row.queue_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const pendingLanes = steps
    .filter((step) => step.status === 'pending' || step.status === 'serving')
    .map((step) => dbLaneToUiLane(step.lane));
  const completedLanes = steps
    .filter((step) => step.status === 'completed')
    .map((step) => dbLaneToUiLane(step.lane));

  return {
    id: row.id,
    queueNumber: row.queue_number,
    patientName: toPatientFullName(row.patients),
    serviceType: dbServiceToUiService(row.service_type),
    requestedLabLane: dbLabServiceToUiRequestedLane(row.requested_lab_service),
    currentLane: dbLaneToUiLane(row.current_lane),
    pendingLanes,
    completedLanes,
    priority: row.priority_lane,
    counter: row.counter_name || uiLaneLabel(dbLaneToUiLane(row.current_lane), row.priority_lane),
    status: dbStatusToUiStatus(row.queue_status),
    createdAt: row.created_at,
    calledAt: row.now_serving_at ?? undefined,
  };
}

export function canEnterLane(entry: QueueEntry, lane: QueueLane) {
  if (!entry.pendingLanes.includes(lane)) {
    return false;
  }

  if (entry.serviceType === 'PRE-EMPLOYMENT') {
    return true;
  }

  return entry.pendingLanes[0] === lane;
}
