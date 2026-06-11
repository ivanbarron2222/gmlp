import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';
import { getActiveVisitContext } from '@/lib/visit-context';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireStaffContext(request);
    const url = new URL(request.url);
    const apeEventIdParam = url.searchParams.get('apeEventId');
    const activeContext = await getActiveVisitContext(supabase);
    const apeEventId = apeEventIdParam || activeContext.apeEventId;

    let query = supabase
      .from('ape_masterlist_batches')
      .select('id, ape_event_id, company_name, source_filename, total_patients, generated_lab_orders, created_at, ape_events(name, ape_code, status)')
      .order('created_at', { ascending: false });

    if (apeEventId) {
      query = query.eq('ape_event_id', apeEventId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ batches: data ?? [], activeApeEventId: activeContext.apeEventId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load APE masterlist batches.' },
      { status: 500 }
    );
  }
}
