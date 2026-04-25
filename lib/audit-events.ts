import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type AuditEventInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  detail?: string | null;
  visitId?: string | null;
  patientId?: string | null;
  queueEntryId?: string | null;
  actorStaffId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditEventInput) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('audit_events').insert({
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    summary: input.summary,
    detail: input.detail ?? null,
    visit_id: input.visitId ?? null,
    patient_id: input.patientId ?? null,
    queue_entry_id: input.queueEntryId ?? null,
    actor_staff_id: input.actorStaffId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listAuditEventsForVisit(visitId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, event_type, entity_type, entity_id, summary, detail, metadata, actor_staff_id, created_at')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
