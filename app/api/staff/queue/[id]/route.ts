import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQueueEntryRow, type QueueEntryRow } from '@/lib/db-queue';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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
        missed_at,
        requeue_required_at,
        completed_at,
        visit_id,
        patients!inner(first_name, middle_name, last_name),
        queue_steps(lane, status, sort_order)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Queue entry not found.' }, { status: 404 });
    }

    const row = data as QueueEntryRow & { visit_id: string };
    let assignedDoctorId: string | null = null;
    let assignedDoctorName: string | null = null;

    if (row.visit_id) {
      const { data: consultationData, error: consultationError } = await supabase
        .from('consultations')
        .select(`
          doctor_directory_id,
          doctors:doctor_directory_id (
            full_name
          )
        `)
        .eq('visit_id', row.visit_id)
        .not('doctor_directory_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (consultationError) {
        throw consultationError;
      }

      if (consultationData?.doctor_directory_id) {
        assignedDoctorId = String(consultationData.doctor_directory_id);
        const doctorProfile = Array.isArray(consultationData.doctors)
          ? consultationData.doctors[0]
          : consultationData.doctors;
        assignedDoctorName = String(doctorProfile?.full_name ?? '');
      }
    }

    return NextResponse.json({
      queueEntry: mapQueueEntryRow({
        ...row,
        assigned_doctor_id: assignedDoctorId,
        assigned_doctor_name: assignedDoctorName,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load queue entry.' },
      { status: 500 }
    );
  }
}
