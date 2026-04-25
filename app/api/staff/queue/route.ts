import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQueueEntryRow, type QueueEntryRow } from '@/lib/db-queue';
import { processQueuePings } from '@/lib/queue-pings';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

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
        notification_ping_count,
        last_ping_at,
        response_at,
        completed_at,
        visit_id,
        patient_id,
        patients!inner(first_name, middle_name, last_name, contact_number, email_address),
        queue_steps(lane, status, sort_order)
      `)
      .eq('queue_date', today)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as Array<QueueEntryRow & { visit_id?: string; patient_id?: string }>;
    const pingsChanged = await processQueuePings(supabase, rows);
    let refreshedRows = rows;

    if (pingsChanged || rows.some((row) => row.queue_status === 'now_serving' && !row.response_at)) {
      const { data: refreshedData, error: refreshedError } = await supabase
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
          notification_ping_count,
          last_ping_at,
          response_at,
          completed_at,
          visit_id,
          patient_id,
          patients!inner(first_name, middle_name, last_name, contact_number, email_address),
          queue_steps(lane, status, sort_order)
        `)
        .eq('queue_date', today)
        .order('created_at', { ascending: true });

      if (refreshedError) {
        throw refreshedError;
      }

      refreshedRows = (refreshedData ?? []) as Array<
        QueueEntryRow & { visit_id?: string; patient_id?: string }
      >;
    }
    const visitIds = refreshedRows.map((row) => row.visit_id).filter(Boolean) as string[];
    const doctorByVisitId = new Map<string, { id: string; name: string }>();

    if (visitIds.length > 0) {
      const { data: consultationsData, error: consultationsError } = await supabase
        .from('consultations')
        .select(`
          visit_id,
          doctor_directory_id,
          doctors:doctor_directory_id (
            full_name
          )
        `)
        .in('visit_id', visitIds)
        .not('doctor_directory_id', 'is', null)
        .order('created_at', { ascending: false });

      if (consultationsError) {
        throw consultationsError;
      }

      for (const consultation of consultationsData ?? []) {
        const visitId = String(consultation.visit_id ?? '');

        if (!visitId || doctorByVisitId.has(visitId) || !consultation.doctor_directory_id) {
          continue;
        }

        const doctorProfile = Array.isArray(consultation.doctors)
          ? consultation.doctors[0]
          : consultation.doctors;

        doctorByVisitId.set(visitId, {
          id: String(consultation.doctor_directory_id),
          name: String(doctorProfile?.full_name ?? ''),
        });
      }
    }

    const queue = refreshedRows.map((row) =>
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
