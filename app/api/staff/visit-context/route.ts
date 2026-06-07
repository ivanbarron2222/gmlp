import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';
import { getActiveVisitContext } from '@/lib/visit-context';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireStaffContext(request);
    const context = await getActiveVisitContext(supabase);

    return NextResponse.json(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load visit context.';
    const status = message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
