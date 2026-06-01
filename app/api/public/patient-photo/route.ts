import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const registrationCode = String(formData.get('registrationCode') ?? '').trim().toUpperCase();
    const birthDate = String(formData.get('birthDate') ?? '').trim();
    const photo = formData.get('photo');

    if (!registrationCode || !birthDate || !(photo instanceof File)) {
      return NextResponse.json({ error: 'Registration reference, birth date, and profile photo are required.' }, { status: 400 });
    }

    if (!/^REG-[A-Z0-9]{6}$/.test(registrationCode) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return NextResponse.json({ error: 'Invalid registration details.' }, { status: 400 });
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP profile photo.' }, { status: 400 });
    }

    if (photo.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Profile photo must be 2 MB or smaller.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: registration, error: registrationError } = await supabase
      .from('self_registrations')
      .select('patient_id')
      .ilike('registration_code', registrationCode)
      .eq('birth_date', birthDate)
      .eq('status', 'verified')
      .maybeSingle();

    if (registrationError) throw registrationError;
    if (!registration?.patient_id) {
      return NextResponse.json({ error: 'Registration record was not found.' }, { status: 404 });
    }

    const patientId = String(registration.patient_id);
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('profile_photo_path')
      .eq('id', patientId)
      .single();

    if (patientError) throw patientError;
    if (patient.profile_photo_path) {
      return NextResponse.json({ error: 'A profile photo is already saved for this patient.' }, { status: 409 });
    }

    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${patientId}/profile-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('patient-profile-photos')
      .upload(storagePath, photo, { contentType: photo.type, upsert: false });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('patients')
      .update({ profile_photo_path: storagePath })
      .eq('id', patientId);

    if (updateError) {
      await supabase.storage.from('patient-profile-photos').remove([storagePath]);
      throw updateError;
    }

    return NextResponse.json({ uploaded: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to upload patient profile photo.' },
      { status: 500 }
    );
  }
}
