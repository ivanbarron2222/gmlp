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
        visit_id,
        patients!inner(first_name, middle_name, last_name),
        queue_steps(lane, status, sort_order)
      `)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as Array<QueueEntryRow & { visit_id?: string }>;
    const visitIds = rows.map((row) => row.visit_id).filter(Boolean) as string[];
    const doctorByVisitId = new Map<string, { id: string; name: string }>();

    if (visitIds.length > 0) {
      const { data: consultationsData, error: consultationsError } = await supabase
        .from('consultations')
        .select(`
          visit_id,
          doctor_id,
          staff_profiles:doctor_id (
            full_name
          )
        `)
        .in('visit_id', visitIds)
        .not('doctor_id', 'is', null)
        .order('created_at', { ascending: false });

      if (consultationsError) {
        throw consultationsError;
      }

      for (const consultation of consultationsData ?? []) {
        const visitId = String(consultation.visit_id ?? '');

        if (!visitId || doctorByVisitId.has(visitId) || !consultation.doctor_id) {
          continue;
        }

        const doctorProfile = Array.isArray(consultation.staff_profiles)
          ? consultation.staff_profiles[0]
          : consultation.staff_profiles;

        doctorByVisitId.set(visitId, {
          id: String(consultation.doctor_id),
          name: String(doctorProfile?.full_name ?? ''),
        });
      }
    }

    const queue = rows.map((row) =>
      mapQueueEntryRow({
        ...row,
        assigned_doctor_id: row.visit_id ? doctorByVisitId.get(row.visit_id)?.id ?? null : null,
        assigned_doctor_name: row.visit_id
          ? doctorByVisitId.get(row.visit_id)?.name ?? null
          : null,
      })
    );

    return NextResponse.json({ queue });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load queue.' },
      { status: 500 }
    );
  }
}
