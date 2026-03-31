export type QueueStatus = 'waiting' | 'serving' | 'completed';
export type QueueLane = 'GENERAL' | 'BLOOD TEST' | 'DRUG TEST' | 'DOCTOR' | 'XRAY';
export type DisplayLane = QueueLane | 'PRIORITY LANE';
export type ServiceType =
  | 'PRE-EMPLOYMENT'
  | 'CHECK-UP'
  | 'LAB';

export interface QueueEntry {
  id: string;
  queueNumber: string;
  patientName: string;
  serviceType: ServiceType;
  requestedLabLane?: Exclude<QueueLane, 'GENERAL' | 'DOCTOR'>;
  currentLane: QueueLane;
  pendingLanes: QueueLane[];
  completedLanes: QueueLane[];
  priority: boolean;
  counter: string;
  status: QueueStatus;
  createdAt: string;
  calledAt?: string;
}

export const queueLanes: QueueLane[] = ['GENERAL', 'BLOOD TEST', 'DRUG TEST', 'DOCTOR', 'XRAY'];
export const serviceLanes: QueueLane[] = ['BLOOD TEST', 'DRUG TEST', 'DOCTOR', 'XRAY'];
export const serviceTypes: ServiceType[] = [
  'PRE-EMPLOYMENT',
  'CHECK-UP',
  'LAB',
];

const STORAGE_KEY = 'gmlp-clinic-queue-v3';

const defaultQueue: QueueEntry[] = [
  {
    id: 'queue-1',
    queueNumber: 'A-001',
    patientName: 'Sarah Connor',
    serviceType: 'PRE-EMPLOYMENT',
    currentLane: 'BLOOD TEST',
    pendingLanes: ['DRUG TEST', 'DOCTOR', 'XRAY'],
    completedLanes: [],
    priority: false,
    counter: 'BLOOD TEST',
    status: 'serving',
    createdAt: '2026-03-29T08:00:00.000Z',
    calledAt: '2026-03-29T08:05:00.000Z',
  },
  {
    id: 'queue-2',
    queueNumber: 'A-002',
    patientName: 'John McClane',
    serviceType: 'CHECK-UP',
    currentLane: 'GENERAL',
    pendingLanes: ['DOCTOR'],
    completedLanes: [],
    priority: false,
    counter: 'General Intake',
    status: 'waiting',
    createdAt: '2026-03-29T08:06:00.000Z',
  },
  {
    id: 'queue-3',
    queueNumber: 'A-003',
    patientName: 'Ellen Ripley',
    serviceType: 'CHECK-UP',
    currentLane: 'GENERAL',
    pendingLanes: ['DOCTOR'],
    completedLanes: [],
    priority: true,
    counter: 'Priority Lane',
    status: 'waiting',
    createdAt: '2026-03-29T08:10:00.000Z',
  },
];

export function getDefaultQueue() {
  return defaultQueue;
}

export function buildQueuePath(
  serviceType: ServiceType,
  requestedLabLane?: Exclude<QueueLane, 'GENERAL' | 'DOCTOR'>
): QueueLane[] {
  switch (serviceType) {
    case 'PRE-EMPLOYMENT':
      return ['BLOOD TEST', 'DRUG TEST', 'DOCTOR', 'XRAY'];
    case 'CHECK-UP':
      return ['DOCTOR'];
    case 'LAB':
      return requestedLabLane ? [requestedLabLane] : ['BLOOD TEST'];
    default:
      return ['DOCTOR'];
  }
}

export function readQueue(): QueueEntry[] {
  if (typeof window === 'undefined') {
    return defaultQueue;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultQueue));
    return defaultQueue;
  }

  try {
    const parsed = JSON.parse(raw) as QueueEntry[];
    return Array.isArray(parsed) ? parsed : defaultQueue;
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultQueue));
    return defaultQueue;
  }
}

export function findQueueEntryById(queue: QueueEntry[], id: string) {
  return queue.find((item) => item.id === id);
}

export function getQueueScanPath(queueId: string) {
  return `/scan/queue/${queueId}`;
}

export function addQueueEntry(
  queue: QueueEntry[],
  input: {
    patientName: string;
    serviceType: ServiceType;
    requestedLabLane?: Exclude<QueueLane, 'GENERAL' | 'DOCTOR'>;
    priority?: boolean;
  }
) {
  const nextEntry: QueueEntry = {
    id: `queue-${Date.now()}`,
    queueNumber: getNextQueueNumber(queue),
    patientName: input.patientName,
    serviceType: input.serviceType,
    requestedLabLane: input.requestedLabLane,
    currentLane: 'GENERAL',
    pendingLanes: buildQueuePath(input.serviceType, input.requestedLabLane),
    completedLanes: [],
    priority: input.priority ?? false,
    counter: input.priority ? 'Priority Lane' : 'General Intake',
    status: 'waiting',
    createdAt: new Date().toISOString(),
  };

  return [nextEntry, ...queue];
}

export function writeQueue(queue: QueueEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function getNextQueueNumber(queue: QueueEntry[]) {
  const maxNumber = queue.reduce((highest, item) => {
    const numericPart = Number.parseInt(item.queueNumber.split('-')[1] ?? '0', 10);
    return Number.isNaN(numericPart) ? highest : Math.max(highest, numericPart);
  }, 0);

  return `A-${String(maxNumber + 1).padStart(3, '0')}`;
}

export function getLaneLabel(entry: QueueEntry): DisplayLane {
  if (entry.currentLane === 'GENERAL' && entry.priority) {
    return 'PRIORITY LANE';
  }

  return entry.currentLane;
}

function canEnterLane(entry: QueueEntry, lane: QueueLane) {
  if (!entry.pendingLanes.includes(lane)) {
    return false;
  }

  if (entry.serviceType === 'PRE-EMPLOYMENT') {
    return true;
  }

  return entry.pendingLanes[0] === lane;
}

export function acceptNextForLane(queue: QueueEntry[], lane: QueueLane) {
  const priorityCandidate = queue.find(
    (item) =>
      item.status === 'waiting' &&
      item.currentLane === 'GENERAL' &&
      item.priority &&
      canEnterLane(item, lane)
  );

  const standardCandidate = queue.find(
    (item) =>
      item.status === 'waiting' &&
      item.currentLane === 'GENERAL' &&
      !item.priority &&
      canEnterLane(item, lane)
  );

  const nextCandidate = priorityCandidate ?? standardCandidate;

  if (!nextCandidate) {
    return queue;
  }

  return queue.map((item) =>
    item.id === nextCandidate.id
      ? {
          ...item,
          currentLane: lane,
          counter: lane,
        }
      : item
  );
}

export function callNextForLane(queue: QueueEntry[], lane: QueueLane) {
  const nextWaiting = queue.find(
    (item) => item.currentLane === lane && item.status === 'waiting'
  );

  if (!nextWaiting) {
    return queue;
  }

  return queue.map((item) => {
    if (item.currentLane === lane && item.status === 'serving') {
      return {
        ...item,
        status: 'waiting' as const,
      };
    }

    if (item.id === nextWaiting.id) {
      return {
        ...item,
        status: 'serving' as const,
        calledAt: new Date().toISOString(),
      };
    }

    return item;
  });
}

export function addReferral(queue: QueueEntry[], id: string, lane: QueueLane) {
  return queue.map((item) => {
    if (item.id !== id) {
      return item;
    }

    if (item.pendingLanes.includes(lane) || item.completedLanes.includes(lane) || item.currentLane === lane) {
      return item;
    }

    return {
      ...item,
      pendingLanes: [...item.pendingLanes, lane],
    };
  });
}

export function startQueueStep(queue: QueueEntry[], id: string, lane: QueueLane) {
  return queue.map((item) => {
    if (item.currentLane === lane && item.status === 'serving' && item.id !== id) {
      return {
        ...item,
        status: 'waiting' as const,
      };
    }

    if (item.id !== id) {
      return item;
    }

    const canStartCurrentLane = item.currentLane === lane && item.pendingLanes.includes(lane);
    const canMoveFromGeneral =
      item.currentLane === 'GENERAL' && canEnterLane(item, lane);

    if (!canStartCurrentLane && !canMoveFromGeneral) {
      return item;
    }

    return {
      ...item,
      currentLane: lane,
      counter: lane,
      status: 'serving' as const,
      calledAt: new Date().toISOString(),
    };
  });
}

export function finishCurrentStep(queue: QueueEntry[], id: string) {
  return queue.map((item) => {
    if (item.id !== id) {
      return item;
    }

    const completedStep = item.currentLane;
    const remainingSteps = item.pendingLanes.filter((lane) => lane !== item.currentLane);

    if (remainingSteps.length === 0) {
      return {
        ...item,
        pendingLanes: [],
        completedLanes: [...item.completedLanes, completedStep],
        status: 'completed' as const,
      };
    }

    return {
      ...item,
      currentLane: 'GENERAL' as const,
      pendingLanes: remainingSteps,
      completedLanes: [...item.completedLanes, completedStep],
      counter: item.priority ? 'Priority Lane' : 'General Intake',
      status: 'waiting' as const,
    };
  });
}
