import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

type DailyRole = 'extractor' | 'tester';

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    const body = (await request.json()) as { role?: DailyRole };

    if (context.jobPositionCode !== 'medical_technologist') {
      return NextResponse.json({ error: 'Daily role selection is only available to Medical Technologists.' }, { status: 403 });
    }

    if (body.role !== 'extractor' && body.role !== 'tester') {
      return NextResponse.json({ error: 'Select either Extractor or Tester.' }, { status: 400 });
    }

    const manilaDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const { data, error } = await context.supabase
      .from('staff_daily_roles')
      .upsert(
        {
          staff_id: context.userId,
          work_date: manilaDate,
          role: body.role,
          selected_at: new Date().toISOString(),
        },
        { onConflict: 'staff_id,work_date' }
      )
      .select('role, work_date')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await context.supabase.from('audit_events').insert({
      event_type: 'medtech_daily_role_selected',
      entity_type: 'staff_profile',
      entity_id: context.userId,
      actor_staff_id: context.userId,
      summary: `Medical Technologist selected ${body.role} role.`,
      metadata: { role: body.role, workDate: manilaDate },
    });

    return NextResponse.json({ dailyRole: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save daily role.' },
      { status: 500 }
    );
  }
}
