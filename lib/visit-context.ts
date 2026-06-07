export type VisitContext = 'opd' | 'ape';

export type ApeEventSummary = {
  id: string;
  apeCode: string;
  name: string;
  location: string;
  status: string;
};

export type ActiveVisitContext = {
  visitContext: VisitContext;
  apeEventId: string | null;
  apeModeEnabled: boolean;
  apeEvent: ApeEventSummary | null;
};

const OPD_CONTEXT: ActiveVisitContext = {
  visitContext: 'opd',
  apeEventId: null,
  apeModeEnabled: false,
  apeEvent: null,
};

function isMissingVisitContextSchema(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = `${maybeError.message ?? ''} ${maybeError.details ?? ''} ${maybeError.hint ?? ''}`.toLowerCase();

  return (
    maybeError.code === '42P01' ||
    maybeError.code === '42703' ||
    maybeError.code === 'PGRST204' ||
    text.includes('clinic_runtime_settings') ||
    text.includes('ape_events') ||
    text.includes('visit_context')
  );
}

export function toVisitContextPayload(context: ActiveVisitContext) {
  return {
    visit_context: context.visitContext,
    ape_event_id: context.apeEventId,
    sync_status: 'synced',
    last_modified_at: new Date().toISOString(),
  };
}

export function toPatientContextPayload(context: ActiveVisitContext) {
  return {
    first_visit_context: context.visitContext,
    first_ape_event_id: context.apeEventId,
    sync_status: 'synced',
    last_modified_at: new Date().toISOString(),
  };
}

export async function getActiveVisitContext(supabase: any): Promise<ActiveVisitContext> {
  const { data, error } = await supabase
    .from('clinic_runtime_settings')
    .select(
      `
        ape_mode_enabled,
        active_ape_event_id,
        ape_events (
          id,
          ape_code,
          name,
          location,
          status
        )
      `
    )
    .eq('id', true)
    .maybeSingle();

  if (error) {
    if (isMissingVisitContextSchema(error)) {
      return OPD_CONTEXT;
    }

    throw error instanceof Error ? error : new Error('Unable to read clinic runtime mode.');
  }

  const row = data as {
    ape_mode_enabled?: boolean | null;
    active_ape_event_id?: string | null;
    ape_events?: {
      id?: string | null;
      ape_code?: string | null;
      name?: string | null;
      location?: string | null;
      status?: string | null;
    } | null;
  } | null;

  if (!row?.ape_mode_enabled || !row.active_ape_event_id) {
    return OPD_CONTEXT;
  }

  return {
    visitContext: 'ape',
    apeEventId: row.active_ape_event_id,
    apeModeEnabled: true,
    apeEvent: row.ape_events
      ? {
          id: String(row.ape_events.id ?? row.active_ape_event_id),
          apeCode: String(row.ape_events.ape_code ?? ''),
          name: String(row.ape_events.name ?? 'Active APE'),
          location: String(row.ape_events.location ?? ''),
          status: String(row.ape_events.status ?? 'active'),
        }
      : null,
  };
}

export function formatVisitContextLabel(context: VisitContext) {
  return context === 'ape' ? 'APE' : 'OPD';
}
