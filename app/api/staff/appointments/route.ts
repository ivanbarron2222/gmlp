import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit-events';
import { assertActionPermission, requireStaffContext } from '@/lib/supabase/admin-auth';

export async function GET(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertActionPermission(context, 'manage_appointments');

    const { data, error } = await context.supabase
      .from('appointments')
      .select(`
        id,
        patient_id,
        visit_id,
        doctor_id,
        scheduled_for,
        arrival_window_minutes,
        status,
        notes,
        created_at,
        updated_at
      `)
      .order('scheduled_for', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ appointments: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load appointments.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertActionPermission(context, 'manage_appointments');

    const body = (await request.json()) as {
      id?: string;
      patientId?: string | null;
      visitId?: string | null;
      doctorId?: string | null;
      scheduledFor?: string;
      arrivalWindowMinutes?: number;
      status?: 'scheduled' | 'arrived' | 'no_show' | 'completed' | 'cancelled';
      notes?: string;
    };

    if (!body.scheduledFor) {
      return NextResponse.json({ error: 'Missing appointment schedule.' }, { status: 400 });
    }

    const payload = {
      patient_id: body.patientId ?? null,
      visit_id: body.visitId ?? null,
      doctor_id: body.doctorId ?? null,
      scheduled_for: body.scheduledFor,
      arrival_window_minutes: Number(body.arrivalWindowMinutes ?? 30),
      status: body.status ?? 'scheduled',
      notes: body.notes?.trim() || null,
      created_by: context.userId,
    };

    const query = body.id
      ? context.supabase.from('appointments').update(payload).eq('id', body.id).select('id, patient_id, visit_id').single()
      : context.supabase.from('appointments').insert(payload).select('id, patient_id, visit_id').single();

    const { data, error } = await query;
    if (error || !data) {
      throw new Error(error?.message ?? 'Unable to save appointment.');
    }

    await recordAuditEvent({
      eventType: body.id ? 'appointment_updated' : 'appointment_created',
      entityType: 'appointment',
      entityId: data.id,
      patientId: String(data.patient_id ?? ''),
      visitId: String(data.visit_id ?? ''),
      actorStaffId: context.userId,
      summary: body.id ? 'Appointment updated.' : 'Appointment scheduled.',
      detail: body.notes?.trim() || null,
      metadata: { scheduledFor: body.scheduledFor, status: payload.status },
    });

    return NextResponse.json({ success: true, appointmentId: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save appointment.' },
      { status: 500 }
    );
  }
}
