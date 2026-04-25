import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type NotificationEventInput = {
  eventType: string;
  channel: 'email' | 'sms';
  recipient: string;
  patientId?: string | null;
  visitId?: string | null;
  reportId?: string | null;
  subject?: string | null;
  payload?: Record<string, unknown>;
  status?: 'pending' | 'sent' | 'failed' | 'skipped';
  providerName?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
};

export async function recordNotificationEvent(input: NotificationEventInput) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('notification_events').insert({
    event_type: input.eventType,
    channel: input.channel,
    recipient: input.recipient,
    patient_id: input.patientId ?? null,
    visit_id: input.visitId ?? null,
    report_id: input.reportId ?? null,
    subject: input.subject ?? null,
    payload: input.payload ?? {},
    status: input.status ?? 'pending',
    provider_name: input.providerName ?? null,
    provider_message_id: input.providerMessageId ?? null,
    error_message: input.errorMessage ?? null,
    sent_at: input.sentAt ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}
