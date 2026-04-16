import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('partner_companies')
      .select('id, company_name')
      .eq('is_active', true)
      .order('company_name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      companies: (data ?? []).map((row) => ({
        id: String(row.id),
        companyName: String(row.company_name ?? ''),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load partner companies.',
      },
      { status: 500 }
    );
  }
}
