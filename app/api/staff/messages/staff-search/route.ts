import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireStaffContext(request);
    const url = new URL(request.url);
    const query = url.searchParams.get('query')?.trim() ?? '';

    let staffQuery = supabase
      .from('staff_profiles')
      .select('id, full_name, email, role, is_active, departments(name), job_positions(name)')
      .eq('is_active', true)
      .neq('id', userId)
      .order('full_name', { ascending: true })
      .limit(12);

    if (query) {
      staffQuery = staffQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data, error } = await staffQuery;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ staff: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to search staff.' },
      { status: 500 }
    );
  }
}
