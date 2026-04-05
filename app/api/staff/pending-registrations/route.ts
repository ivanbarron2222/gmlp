import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function mapRegistration(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    submittedAt: String(row.created_at),
    firstName: String(row.first_name ?? ''),
    middleName: String(row.middle_name ?? ''),
    lastName: String(row.last_name ?? ''),
    company: String(row.company ?? ''),
    birthDate: String(row.birth_date ?? ''),
    gender: String(row.gender ?? ''),
    contactNumber: String(row.contact_number ?? ''),
    emailAddress: String(row.email_address ?? ''),
    streetAddress: String(row.street_address ?? ''),
    city: String(row.city ?? ''),
    province: String(row.province ?? ''),
    serviceNeeded:
      row.service_needed === 'pre_employment'
        ? 'Pre-Employment'
        : row.service_needed === 'check_up'
          ? 'Check-Up'
          : 'Lab',
    requestedLabService:
      row.requested_lab_service === 'blood_test'
        ? 'Blood Test'
        : row.requested_lab_service === 'drug_test'
          ? 'Drug Test'
          : row.requested_lab_service === 'xray'
            ? 'Xray'
            : row.requested_lab_service === 'ecg'
              ? 'ECG'
            : '',
    notes: String(row.notes ?? ''),
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('self_registrations')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      registrations: (data ?? []).map((row) => mapRegistration(row as Record<string, unknown>)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch pending registrations.',
      },
      { status: 500 }
    );
  }
}
