import type { QueueEntry, QueueLane } from '@/lib/queue-store';

export async function fetchQueueEntries() {
  const response = await fetch('/api/staff/queue', { cache: 'no-store' });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to load queue.');
  }

  const payload = (await response.json()) as { queue: QueueEntry[] };
  return payload.queue;
}

export async function fetchQueueEntry(queueId: string) {
  const response = await fetch(`/api/staff/queue/${encodeURIComponent(queueId)}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to load queue entry.');
  }

  const payload = (await response.json()) as { queueEntry: QueueEntry };
  return payload.queueEntry;
}

export async function postQueueAction(
  body:
    | { action: 'accept_next'; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
    | { action: 'call_next'; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
    | { action: 'finish_step'; queueId: string }
    | { action: 'start_step'; queueId: string; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
    | { action: 'add_referral'; queueId: string; lane: Exclude<QueueLane, 'GENERAL' | 'DOCTOR'> }
) {
  const response = await fetch('/api/staff/queue/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to update queue.');
  }

  const payload = (await response.json()) as { queue: QueueEntry[]; activatedQueueId?: string | null };
  return payload.queue;
}

export async function postQueueActionWithContext(
  body:
    | { action: 'accept_next'; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
    | { action: 'call_next'; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
    | { action: 'finish_step'; queueId: string }
    | { action: 'start_step'; queueId: string; lane: Exclude<QueueLane, 'GENERAL'>; actorStaffId?: string }
    | { action: 'add_referral'; queueId: string; lane: Exclude<QueueLane, 'GENERAL' | 'DOCTOR'> }
) {
  const response = await fetch('/api/staff/queue/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to update queue.');
  }

  return (await response.json()) as { queue: QueueEntry[]; activatedQueueId?: string | null };
}
