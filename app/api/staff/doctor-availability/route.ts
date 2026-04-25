import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

function getManilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function assertNurseOrAdmin(role: string) {
  if (role !== 'admin' && role !== 'nurse') {
    throw new Error('Nurse access required.');
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertNurseOrAdmin(context.role);

    const availabilityDate = getManilaDate();
    const { data: doctors, error: doctorsError } = await context.supabase
      .from('doctors')
      .select('id, full_name, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (doctorsError) {
      throw new Error(doctorsError.message);
    }

    const doctorIds = (doctors ?? []).map((doctor) => String(doctor.id));
    const availabilityByDoctorId = new Map<string, boolean>();

    if (doctorIds.length > 0) {
      const { data: availabilityRows, error: availabilityError } = await context.supabase
        .from('doctor_availability')
        .select('doctor_id, is_available')
        .eq('availability_date', availabilityDate)
        .in('doctor_id', doctorIds);

      if (availabilityError) {
        throw new Error(availabilityError.message);
      }

      for (const row of availabilityRows ?? []) {
        availabilityByDoctorId.set(String(row.doctor_id), Boolean(row.is_available));
      }
    }

    return NextResponse.json({
      availabilityDate,
      doctors: (doctors ?? []).map((doctor) => ({
        id: String(doctor.id),
        fullName: String(doctor.full_name ?? ''),
        isAvailableToday: availabilityByDoctorId.get(String(doctor.id)) ?? true,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load doctor availability.';
    const status =
      message === 'Nurse access required.' || message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertNurseOrAdmin(context.role);

    const body = (await request.json()) as {
      doctorId?: string;
      isAvailableToday?: boolean;
    };

    if (!body.doctorId) {
      return NextResponse.json({ error: 'Missing doctor.' }, { status: 400 });
    }

    const availabilityDate = getManilaDate();
    const { data, error } = await context.supabase
      .from('doctor_availability')
      .upsert(
        {
          doctor_id: body.doctorId,
          availability_date: availabilityDate,
          is_available: Boolean(body.isAvailableToday),
          updated_by: context.userId,
        },
        { onConflict: 'doctor_id,availability_date' }
      )
      .select('doctor_id, is_available')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      availabilityDate,
      doctor: {
        id: String(data.doctor_id),
        isAvailableToday: Boolean(data.is_available),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update doctor availability.';
    const status =
      message === 'Nurse access required.' || message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
