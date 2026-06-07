import { NextResponse } from 'next/server';
import { requireStaffContext, type AdminStaffContext } from '@/lib/supabase/admin-auth';
import { getActiveVisitContext, toVisitContextPayload } from '@/lib/visit-context';

const allTestTypes = ['physical_exam', 'cbc', 'urinalysis', 'fecalysis', 'serology', 'xray', 'drug_test', 'ecg'] as const;
type TestType = (typeof allTestTypes)[number];

function getVisibleTestTypes(context: AdminStaffContext): TestType[] {
  if (context.jobPositionCode === 'administrator' || context.jobPositionCode === 'encoder') return [...allTestTypes];
  if (context.jobPositionCode === 'medical_technologist') return ['cbc', 'urinalysis', 'fecalysis', 'serology'];
  if (context.jobPositionCode === 'radiology_staff') return ['xray'];
  if (context.jobPositionCode === 'drug_test_staff') return ['drug_test'];
  if (context.jobPositionCode === 'doctor' || context.jobPositionCode === 'nurse') return ['physical_exam'];
  return [];
}

async function canEditTestType(context: AdminStaffContext, testType: TestType) {
  const visibleTypes = getVisibleTestTypes(context);
  if (!visibleTypes.includes(testType)) return false;
  if (context.jobPositionCode !== 'medical_technologist') return true;

  const manilaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const { data } = await context.supabase
    .from('staff_daily_roles')
    .select('role')
    .eq('staff_id', context.userId)
    .eq('work_date', manilaDate)
    .maybeSingle();

  return data?.role === 'tester';
}

function formatTestTypeLabel(testType: TestType) {
  return testType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function getVisitContextPayload(context: AdminStaffContext, visitId?: string | null) {
  if (visitId) {
    const { data } = await context.supabase
      .from('visits')
      .select('visit_context, ape_event_id')
      .eq('id', visitId)
      .maybeSingle();

    if (data?.visit_context) {
      return {
        visit_context: data.visit_context,
        ape_event_id: data.ape_event_id ?? null,
        sync_status: 'synced',
        last_modified_at: new Date().toISOString(),
      };
    }
  }

  return toVisitContextPayload(await getActiveVisitContext(context.supabase));
}

async function recordResultAuditEvent(
  context: AdminStaffContext,
  input: {
    patientId: string;
    testInstanceId: string;
    visitId?: string | null;
    testType: TestType;
    status: string;
    action: 'created' | 'updated';
  }
) {
  const { error } = await context.supabase.from('audit_events').insert({
    event_type: `patient_result_${input.action}`,
    entity_type: 'patient_test_instance',
    entity_id: input.testInstanceId,
    visit_id: input.visitId ?? null,
    patient_id: input.patientId,
    actor_staff_id: context.userId,
    summary: `${formatTestTypeLabel(input.testType)} result ${input.action}`,
    detail: `${context.fullName || 'Staff'} saved ${formatTestTypeLabel(input.testType)} as ${input.status}.`,
    metadata: {
      testType: input.testType,
      status: input.status,
      staffName: context.fullName,
      jobPositionCode: context.jobPositionCode,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const context = await requireStaffContext(request);
    const { patientId } = await params;
    const visibleTestTypes = getVisibleTestTypes(context);
    const { data: patient, error: patientError } = await context.supabase
      .from('patients')
      .select('id, patient_code, first_name, middle_name, last_name, company, birth_date, gender, contact_number, email_address, street_address, city, province, profile_photo_path')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: patientError?.message ?? 'Patient not found.' }, { status: 404 });
    }

    const [{ data: visits, error: visitsError }, { data: instances, error: instancesError }] = await Promise.all([
      context.supabase
        .from('visits')
        .select('id, visit_code, service_type, status, current_lane, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
      visibleTestTypes.length > 0
        ? context.supabase
            .from('patient_test_instances')
            .select('id, visit_id, test_type, sequence_number, status, result_payload, notes, encoded_at, created_at, updated_at')
            .eq('patient_id', patientId)
            .in('test_type', visibleTestTypes)
            .order('sequence_number', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (visitsError) throw new Error(visitsError.message);
    if (instancesError) throw new Error(instancesError.message);

    let profilePhotoUrl = '';
    if (patient.profile_photo_path) {
      const { data } = await context.supabase.storage
        .from('patient-profile-photos')
        .createSignedUrl(String(patient.profile_photo_path), 3600);
      profilePhotoUrl = data?.signedUrl ?? '';
    }

    const editableTestTypes = (
      await Promise.all(visibleTestTypes.map(async (testType) => [testType, await canEditTestType(context, testType)] as const))
    ).filter(([, canEdit]) => canEdit).map(([testType]) => testType);

    return NextResponse.json({ patient: { ...patient, profilePhotoUrl }, visits: visits ?? [], testInstances: instances ?? [], visibleTestTypes, editableTestTypes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load patient profile.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const context = await requireStaffContext(request);
    const { patientId } = await params;
    const body = (await request.json()) as {
      id?: string;
      visitId?: string | null;
      testType?: TestType;
      resultPayload?: Record<string, unknown>;
      notes?: string;
      status?: 'draft' | 'completed';
    };

    if (!body.testType || !allTestTypes.includes(body.testType)) {
      return NextResponse.json({ error: 'Valid test type is required.' }, { status: 400 });
    }
    if (!(await canEditTestType(context, body.testType))) {
      return NextResponse.json({ error: 'Result editing access required for this examination.' }, { status: 403 });
    }

    if (body.id) {
      const { data, error } = await context.supabase
        .from('patient_test_instances')
        .update({
          result_payload: body.resultPayload ?? {},
          notes: body.notes?.trim() || null,
          status: body.status ?? 'draft',
          encoded_by: context.userId,
          encoded_at: new Date().toISOString(),
          last_modified_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .eq('patient_id', patientId)
        .eq('test_type', body.testType)
        .select('id, visit_id, test_type, status')
        .single();
      if (error) throw new Error(error.message);
      await recordResultAuditEvent(context, {
        patientId,
        testInstanceId: String(data.id),
        visitId: data.visit_id ? String(data.visit_id) : null,
        testType: body.testType,
        status: String(data.status ?? body.status ?? 'draft'),
        action: 'updated',
      });
      return NextResponse.json({ testInstance: data });
    }

    const visitContextPayload = await getVisitContextPayload(context, body.visitId);
    const { data: latest } = await context.supabase
      .from('patient_test_instances')
      .select('sequence_number')
      .eq('patient_id', patientId)
      .eq('test_type', body.testType)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await context.supabase
      .from('patient_test_instances')
      .insert({
        patient_id: patientId,
        visit_id: body.visitId || null,
        test_type: body.testType,
        sequence_number: Number(latest?.sequence_number ?? 0) + 1,
        status: 'draft',
        result_payload: body.resultPayload ?? {},
        encoded_by: context.userId,
        encoded_at: new Date().toISOString(),
        ...visitContextPayload,
      })
      .select('id, visit_id, test_type, status')
      .single();
    if (error) throw new Error(error.message);
    await recordResultAuditEvent(context, {
      patientId,
      testInstanceId: String(data.id),
      visitId: data.visit_id ? String(data.visit_id) : null,
      testType: body.testType,
      status: String(data.status ?? 'draft'),
      action: 'created',
    });
    return NextResponse.json({ testInstance: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save examination result.' }, { status: 500 });
  }
}
