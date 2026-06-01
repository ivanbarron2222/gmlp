import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

const allowedPositions = new Set(['administrator', 'front_desk_cashier', 'nurse', 'encoder']);

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    if (!context.jobPositionCode || !allowedPositions.has(context.jobPositionCode)) {
      return NextResponse.json({ error: 'Patient photo upload access required.' }, { status: 403 });
    }

    const formData = await request.formData();
    const patientId = String(formData.get('patientId') ?? '').trim();
    const photo = formData.get('photo');

    if (!patientId || !(photo instanceof File)) {
      return NextResponse.json({ error: 'Patient and profile photo are required.' }, { status: 400 });
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP profile photo.' }, { status: 400 });
    }

    if (photo.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Profile photo must be 2 MB or smaller.' }, { status: 400 });
    }

    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${patientId}/profile-${Date.now()}.${extension}`;
    const { data: patient, error: patientError } = await context.supabase
      .from('patients')
      .select('id, profile_photo_path')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: patientError?.message ?? 'Patient not found.' }, { status: 404 });
    }

    const { error: uploadError } = await context.supabase.storage
      .from('patient-profile-photos')
      .upload(storagePath, photo, { contentType: photo.type, upsert: false });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: updateError } = await context.supabase
      .from('patients')
      .update({ profile_photo_path: storagePath })
      .eq('id', patientId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (patient.profile_photo_path) {
      await context.supabase.storage.from('patient-profile-photos').remove([String(patient.profile_photo_path)]);
    }

    await context.supabase.from('audit_events').insert({
      event_type: patient.profile_photo_path ? 'patient_photo_replaced' : 'patient_photo_created',
      entity_type: 'patient',
      entity_id: patientId,
      patient_id: patientId,
      actor_staff_id: context.userId,
      summary: patient.profile_photo_path ? 'Patient profile photo replaced.' : 'Patient profile photo captured.',
      metadata: { storagePath },
    });

    return NextResponse.json({ profilePhotoPath: storagePath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to upload patient profile photo.' },
      { status: 500 }
    );
  }
}
