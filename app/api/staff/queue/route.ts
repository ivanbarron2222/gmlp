import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQueueEntryRow, type QueueEntryRow } from '@/lib/db-queue';

export async function GET() {
  try {
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
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const queue = ((data ?? []) as QueueEntryRow[]).map(mapQueueEntryRow);

    return NextResponse.json({ queue });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load queue.' },
      { status: 500 }
    );
  }
}
