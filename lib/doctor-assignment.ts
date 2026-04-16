import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type DoctorAssignmentOption = {
  id: string;
  fullName: string;
  email: string;
  activeLoad: number;
  pendingConsultations: number;
  inProgressConsultations: number;
};

export type DoctorAssignmentSuggestion = {
  doctors: DoctorAssignmentOption[];
  preferredDoctorId: string | null;
  preferredDoctorName: string | null;
  preferredDoctorReason: 'history' | 'load_balanced' | null;
  matchedPatientId: string | null;
  matchedPatientName: string | null;
  patientMatchSource: 'name_birthdate_contact' | 'name_birthdate' | 'email_birthdate' | null;
};

type PatientLookup = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;
  contactNumber?: string;
  emailAddress?: string;
};

type PatientMatch = {
  id: string;
  fullName: string;
  matchSource: 'name_birthdate_contact' | 'name_birthdate' | 'email_birthdate';
};

function toDisplayName(patient: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
}) {
  return [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ');
}

export async function findMatchingPatient(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  patient?: PatientLookup
): Promise<PatientMatch | null> {
  const firstName = patient?.firstName?.trim();
  const lastName = patient?.lastName?.trim();
  const birthDate = patient?.birthDate?.trim();
  const contactNumber = patient?.contactNumber?.trim();
  const emailAddress = patient?.emailAddress?.trim();

  if (!birthDate) {
    return null;
  }

  if (firstName && lastName && contactNumber) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, middle_name, last_name')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .eq('birth_date', birthDate)
      .eq('contact_number', contactNumber)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.id) {
      return {
        id: String(data.id),
        fullName: toDisplayName(data),
        matchSource: 'name_birthdate_contact',
      };
    }
  }

  if (firstName && lastName) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, middle_name, last_name')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .eq('birth_date', birthDate)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.id) {
      return {
        id: String(data.id),
        fullName: toDisplayName(data),
        matchSource: 'name_birthdate',
      };
    }
  }

  if (emailAddress) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, middle_name, last_name')
      .ilike('email_address', emailAddress)
      .eq('birth_date', birthDate)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.id) {
      return {
        id: String(data.id),
        fullName: toDisplayName(data),
        matchSource: 'email_birthdate',
      };
    }
  }

  return null;
}

export async function getDoctorAssignmentSuggestion(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  patient?: PatientLookup
): Promise<DoctorAssignmentSuggestion> {
  const { data: doctorsData, error: doctorsError } = await supabase
    .from('staff_profiles')
    .select('id, full_name, email')
    .eq('role', 'doctor')
    .eq('is_active', true);

  if (doctorsError) {
    throw doctorsError;
  }

  const doctorIds = (doctorsData ?? []).map((doctor) => String(doctor.id));
  const loadByDoctorId = new Map<
    string,
    { pendingConsultations: number; inProgressConsultations: number }
  >();

  if (doctorIds.length > 0) {
    const { data: consultationsData, error: consultationsError } = await supabase
      .from('consultations')
      .select('doctor_id, status')
      .in('doctor_id', doctorIds)
      .in('status', ['pending', 'in_progress']);

    if (consultationsError) {
      throw consultationsError;
    }

    for (const consultation of consultationsData ?? []) {
      const doctorId = String(consultation.doctor_id ?? '');

      if (!doctorId) {
        continue;
      }

      const current = loadByDoctorId.get(doctorId) ?? {
        pendingConsultations: 0,
        inProgressConsultations: 0,
      };

      if (consultation.status === 'in_progress') {
        current.inProgressConsultations += 1;
      } else {
        current.pendingConsultations += 1;
      }

      loadByDoctorId.set(doctorId, current);
    }
  }

  const doctors: DoctorAssignmentOption[] = (doctorsData ?? [])
    .map((doctor) => {
      const load = loadByDoctorId.get(String(doctor.id)) ?? {
        pendingConsultations: 0,
        inProgressConsultations: 0,
      };

      return {
        id: String(doctor.id),
        fullName: String(doctor.full_name ?? ''),
        email: String(doctor.email ?? ''),
        pendingConsultations: load.pendingConsultations,
        inProgressConsultations: load.inProgressConsultations,
        activeLoad: load.pendingConsultations + load.inProgressConsultations,
      };
    })
    .sort((left, right) => {
      if (left.activeLoad !== right.activeLoad) {
        return left.activeLoad - right.activeLoad;
      }

      if (left.inProgressConsultations !== right.inProgressConsultations) {
        return left.inProgressConsultations - right.inProgressConsultations;
      }

      return left.fullName.localeCompare(right.fullName);
    });

  let preferredDoctorId: string | null = null;
  let preferredDoctorName: string | null = null;
  let preferredDoctorReason: 'history' | 'load_balanced' | null = null;
  let matchedPatientId: string | null = null;
  let matchedPatientName: string | null = null;
  let patientMatchSource: 'name_birthdate_contact' | 'name_birthdate' | 'email_birthdate' | null =
    null;

  const matchedPatient = await findMatchingPatient(supabase, patient);

  if (matchedPatient?.id) {
    matchedPatientId = matchedPatient.id;
    matchedPatientName = matchedPatient.fullName;
    patientMatchSource = matchedPatient.matchSource;
    const { data: visitsData, error: visitsError } = await supabase
      .from('visits')
      .select('id')
      .eq('patient_id', matchedPatient.id)
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
        const matchedDoctor = doctors.find(
          (doctor) => doctor.id === String(consultationData.doctor_id)
        );

        if (matchedDoctor) {
          preferredDoctorId = matchedDoctor.id;
          preferredDoctorName = matchedDoctor.fullName;
          preferredDoctorReason = 'history';
        }
      }
    }
  }

  if (!preferredDoctorId && doctors.length > 0) {
    preferredDoctorId = doctors[0].id;
    preferredDoctorName = doctors[0].fullName;
    preferredDoctorReason = 'load_balanced';
  }

  return {
    doctors,
    preferredDoctorId,
    preferredDoctorName,
    preferredDoctorReason,
    matchedPatientId,
    matchedPatientName,
    patientMatchSource,
  };
}
