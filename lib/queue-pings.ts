import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { recordNotificationEvent } from '@/lib/notification-events';

type QueuePingRow = {
  id?: string | null;
  queue_number?: string | null;
  queue_status?: string | null;
  current_lane?: string | null;
  counter_name?: string | null;
  now_serving_at?: string | null;
  notification_ping_count?: number | string | null;
  last_ping_at?: string | null;
  response_at?: string | null;
  visit_id?: string | null;
  patient_id?: string | null;
  patients?: {
    contact_number?: string | null;
    email_address?: string | null;
  } | Array<{
    contact_number?: string | null;
    email_address?: string | null;
  }> | null;
};

function getPatientContact(row: QueuePingRow) {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
  const sms = String(patient?.contact_number ?? '').trim();
  const email = String(patient?.email_address ?? '').trim();

  if (sms) {
    return { channel: 'sms' as const, recipient: sms };
  }

  if (email) {
    return { channel: 'email' as const, recipient: email };
  }

  return null;
}

async function recordQueuePing(row: QueuePingRow, pingNumber: number) {
  const contact = getPatientContact(row);

  if (!contact) {
    return;
  }

  await recordNotificationEvent({
    eventType: 'queue_call_ping',
    channel: contact.channel,
    recipient: contact.recipient,
    patientId: row.patient_id ?? null,
    visitId: row.visit_id ?? null,
    subject: `Queue ${row.queue_number} is being called`,
    payload: {
      queueId: row.id,
      queueNumber: row.queue_number,
      lane: row.current_lane,
      counter: row.counter_name,
      pingNumber,
      message: `Queue ${row.queue_number} is now being called. Please proceed to ${row.counter_name ?? row.current_lane}.`,
    },
    status: 'pending',
  });
}

export async function processQueuePings(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  rows: QueuePingRow[]
) {
  const now = Date.now();
  let changed = false;

  for (const row of rows) {
    if (row.queue_status !== 'now_serving' || row.response_at || !row.now_serving_at || !row.id) {
      continue;
    }

    const pingCount = Number(row.notification_ping_count ?? 0);
    const lastPingAt = row.last_ping_at ? new Date(row.last_ping_at).getTime() : 0;
    const dueForPing = pingCount === 0 || now - lastPingAt >= 10_000;

    if (!dueForPing) {
      continue;
    }

    const timestamp = new Date().toISOString();

    if (pingCount >= 3) {
      const { error } = await supabase
        .from('queue_entries')
        .update({
          queue_status: 'requeue_required',
          requeue_required_at: timestamp,
        })
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      changed = true;
      continue;
    }

    const nextPing = pingCount + 1;
    await recordQueuePing(row, nextPing);

    const { error } = await supabase
      .from('queue_entries')
      .update({
        notification_ping_count: nextPing,
        last_ping_at: timestamp,
      })
      .eq('id', row.id);

    if (error) {
      throw error;
    }

    changed = true;
  }

  return changed;
}
