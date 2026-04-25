import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function isLabService(item: { service_code?: string | null; category?: string | null; service_lane?: string | null }) {
  const category = String(item.category ?? '').toLowerCase();
  return Boolean(item.service_lane) || category.includes('laboratory') || category.includes('imaging');
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('service_catalog')
      .select('id, service_code, service_name, category, amount, is_active, sort_order, service_lane')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('service_name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      labServices: (data ?? [])
        .filter(isLabService)
        .map((item) => ({
          id: String(item.id),
          code: String(item.service_code),
          name: String(item.service_name),
          category: String(item.category),
          amount: Number(item.amount ?? 0),
          serviceLane: item.service_lane ? String(item.service_lane) : null,
        })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load lab services.' },
      { status: 500 }
    );
  }
}
