import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type DoctorOption = {
  id: string;
  fullName: string;
  email: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const firstName = url.searchParams.get('firstName')?.trim() ?? '';
    const lastName = url.searchParams.get('lastName')?.trim() ?? '';
    const birthDate = url.searchParams.get('birthDate')?.trim() ?? '';
    const contactNumber = url.searchParams.get('contactNumber')?.trim() ?? '';
    const supabase = getSupabaseAdminClient();

    const { data: doctorsData, error: doctorsError } = await supabase
      .from('staff_profiles')
      .select('id, full_name, email')
      .eq('role', 'doctor')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (doctorsError) {
      throw doctorsError;
    }

    const doctors: DoctorOption[] = (doctorsData ?? []).map((doctor) => ({
      id: String(doctor.id),
      fullName: String(doctor.full_name ?? ''),
      email: String(doctor.email ?? ''),
    }));

    let preferredDoctorId: string | null = null;
    let preferredDoctorName: string | null = null;

    if (firstName && lastName && birthDate) {
      let patientQuery = supabase
        .from('patients')
        .select('id')
        .eq('first_name', firstName)
        .eq('last_name', lastName)
        .eq('birth_date', birthDate)
        .limit(1);

      if (contactNumber) {
        patientQuery = patientQuery.eq('contact_number', contactNumber);
      }

      const { data: patientData, error: patientError } = await patientQuery.maybeSingle();

      if (patientError) {
        throw patientError;
      }

      if (patientData?.id) {
        const { data: visitsData, error: visitsError } = await supabase
          .from('visits')
          .select('id')
          .eq('patient_id', patientData.id)
          .order('created_at', { ascending: false });

        if (visitsError) {
          throw visitsError;
        }

        const visitIds = (visitsData ?? []).map((visit) => String(visit.id));

        if (visitIds.length > 0) {
          const { data: consultationData, error: consultationError } = await supabase
            .from('consultations')
            .select(`
              doctor_id,
              staff_profiles:doctor_id (
                full_name
              ),
              created_at
            `)
            .in('visit_id', visitIds)
            .not('doctor_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (consultationError) {
            throw consultationError;
          }

          if (consultationData?.doctor_id) {
            preferredDoctorId = String(consultationData.doctor_id);
            const doctorProfile = Array.isArray(consultationData.staff_profiles)
              ? consultationData.staff_profiles[0]
              : consultationData.staff_profiles;
            preferredDoctorName = String(doctorProfile?.full_name ?? '');
          }
        }
      }
    }

    return NextResponse.json({
      doctors,
      preferredDoctorId,
      preferredDoctorName,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load doctor assignments.',
      },
      { status: 500 }
    );
  }
}
