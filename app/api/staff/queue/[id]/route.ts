import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQueueEntryRow, type QueueEntryRow } from '@/lib/db-queue';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('queue_entries')
      .select(`
        id,
        queue_number,
        service_type,
        requested_lab_service,
        current_lane,
        queue_status,
        counter_name,
        priority_lane,
        created_at,
        now_serving_at,
        completed_at,
        patients!inner(first_name, middle_name, last_name),
        queue_steps(lane, status, sort_order)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
    }

    return NextResponse.json({ queueEntry: mapQueueEntryRow(data as QueueEntryRow) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load queue entry.' },
      { status: 500 }
    );
  }
}
