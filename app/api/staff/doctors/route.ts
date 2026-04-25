import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getDoctorAssignmentSuggestion } from '@/lib/doctor-assignment';

type DoctorOption = {
  id: string;
  fullName: string;
  email?: string;
  activeLoad: number;
  pendingConsultations: number;
  inProgressConsultations: number;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const firstName = url.searchParams.get('firstName')?.trim() ?? '';
    const lastName = url.searchParams.get('lastName')?.trim() ?? '';
    const birthDate = url.searchParams.get('birthDate')?.trim() ?? '';
    const contactNumber = url.searchParams.get('contactNumber')?.trim() ?? '';
    const emailAddress = url.searchParams.get('emailAddress')?.trim() ?? '';
    const supabase = getSupabaseAdminClient();
    const assignment = await getDoctorAssignmentSuggestion(supabase, {
      firstName,
      lastName,
      birthDate,
      contactNumber,
      emailAddress,
    });

    const doctors: DoctorOption[] = assignment.doctors.map((doctor) => ({
      id: doctor.id,
      fullName: doctor.fullName,
      email: doctor.email,
      activeLoad: doctor.activeLoad,
      pendingConsultations: doctor.pendingConsultations,
      inProgressConsultations: doctor.inProgressConsultations,
    }));

    return NextResponse.json({
      doctors,
      preferredDoctorId: assignment.preferredDoctorId,
      preferredDoctorName: assignment.preferredDoctorName,
      preferredDoctorReason: assignment.preferredDoctorReason,
      matchedPatientId: assignment.matchedPatientId,
      matchedPatientName: assignment.matchedPatientName,
      patientMatchSource: assignment.patientMatchSource,
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
