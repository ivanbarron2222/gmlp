import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('service_catalog')
      .select('id, service_code, service_name, category, amount, is_active, sort_order, service_lane')
      .order('sort_order', { ascending: true })
      .order('service_name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      services: (data ?? []).map((item) => ({
        id: String(item.service_code),
        dbId: String(item.id),
        name: String(item.service_name),
        category: String(item.category),
        amount: Number(item.amount ?? 0),
        isActive: Boolean(item.is_active),
        sortOrder: Number(item.sort_order ?? 0),
        serviceLane: item.service_lane ? String(item.service_lane) : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load service catalog.' },
      { status: 500 }
    );
  }
}
