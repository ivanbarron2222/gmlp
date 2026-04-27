import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPasswordProtectedZip } from '@/lib/zip-crypto';

type ReportStatus = 'draft' | 'validated' | 'released';

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeEmail(value: unknown) {
  return normalize(value).toLowerCase();
}

function normalizeRegistrationReference(value: unknown) {
  return normalize(value).toUpperCase();
}

function normalizePassword(value: unknown) {
  return normalize(value).replace(/\s+/g, '').toLowerCase();
}

function getPatientDownloadPassword(patient: { id: string; patient_code?: string | null; last_name: string }) {
  const source = patient.patient_code || patient.id;
  const numericSuffix = source.replace(/\D/g, '').slice(-4);
  const fallbackSuffix = patient.id.replace(/-/g, '').slice(-4);
  const lastFour = numericSuffix || fallbackSuffix;

  return normalizePassword(`${patient.last_name}${lastFour}`);
}

async function getReleasedReportPath(supabase: ReturnType<typeof getSupabaseAdminClient>, visitId: string) {
  const { data: labOrders, error: ordersError } = await supabase
    .from('lab_orders')
    .select('id')
    .eq('visit_id', visitId);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const labOrderIds = (labOrders ?? []).map((order) => order.id);
  if (labOrderIds.length === 0) {
    return { error: 'No released report file found.', status: 404 as const };
  }

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('status, pdf_storage_path, released_at')
    .in('lab_order_id', labOrderIds)
    .order('released_at', { ascending: false });

  if (reportsError) {
    throw new Error(reportsError.message);
  }

  const releasedReport = (reports ?? []).find(
    (report) => report.status === ('released' satisfies ReportStatus) && report.pdf_storage_path
  );

  if (!releasedReport?.pdf_storage_path) {
    return { error: 'Released PDF is not available for this report yet.', status: 404 as const };
  }

  return {
    path: releasedReport.pdf_storage_path,
    releasedAt: releasedReport.released_at ? String(releasedReport.released_at) : null,
  };
}

async function createReleasedReportDownloadUrl(supabase: ReturnType<typeof getSupabaseAdminClient>, visitId: string) {
  const releasedReport = await getReleasedReportPath(supabase, visitId);
  if ('error' in releasedReport) {
    return releasedReport;
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from('reports')
    .createSignedUrl(releasedReport.path, 60 * 10, {
      download: true,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    throw new Error(signedUrlError?.message ?? 'Unable to create signed PDF URL.');
  }

  return {
    downloadUrl: signedUrl.signedUrl,
    path: releasedReport.path,
    expiresInSeconds: 60 * 10,
  };
}

function getSafeZipFilename(queueId: string) {
  const safeId = queueId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32) || 'result';
  return `gmlp-result-${safeId}.zip`;
}

export async function GET(request: Request) {
  try {
    void request;

    return NextResponse.json(
      { error: 'Patient downloads require verification and password.' },
      { status: 405 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to prepare PDF download.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const queueId = normalize(body.queueId);
    const registrationReference = normalizeRegistrationReference(body.registrationReference);
    const firstName = normalize(body.firstName);
    const lastName = normalize(body.lastName);
    const birthDate = normalize(body.birthDate);
    const emailAddress = normalizeEmail(body.emailAddress);
    const password = normalizePassword(body.password);

    if (!queueId || !birthDate || !password) {
      return NextResponse.json(
        { error: 'Queue reference, birth date, and password are required.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    let patientRows: Array<{ id: string; patient_code: string | null; last_name: string }> = [];

    if (registrationReference) {
      const { data: registration, error: registrationError } = await supabase
        .from('self_registrations')
        .select('patient_id')
        .ilike('registration_code', registrationReference)
        .eq('birth_date', birthDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (registrationError) {
        throw registrationError;
      }

      if (registration?.patient_id) {
        const { data: patient, error: patientError } = await supabase
          .from('patients')
          .select('id, patient_code, last_name')
          .eq('id', String(registration.patient_id))
          .maybeSingle();

        if (patientError) {
          throw patientError;
        }

        if (patient) {
          patientRows = [
            {
              id: String(patient.id),
              patient_code: patient.patient_code ? String(patient.patient_code) : null,
              last_name: String(patient.last_name ?? ''),
            },
          ];
        }
      }
    }

    if (!patientRows.length && firstName && lastName && emailAddress) {
      const { data: patients, error: patientError } = await supabase
        .from('patients')
        .select('id, patient_code, last_name')
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .eq('birth_date', birthDate)
        .ilike('email_address', emailAddress)
        .limit(5);

      if (patientError) {
        throw patientError;
      }

      patientRows = (patients ?? []).map((patient) => ({
        id: String(patient.id),
        patient_code: patient.patient_code ? String(patient.patient_code) : null,
        last_name: String(patient.last_name ?? ''),
      }));
    }

    if (patientRows.length === 0) {
      return NextResponse.json({ error: 'Patient verification failed.' }, { status: 404 });
    }

    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .select('visit_id, patient_id')
      .eq('id', queueId)
      .in(
        'patient_id',
        patientRows.map((patient) => patient.id)
      )
      .single();

    if (queueError || !queueEntry) {
      return NextResponse.json({ error: 'Queue entry was not found for this patient.' }, { status: 404 });
    }

    const matchedPatient = patientRows.find((patient) => patient.id === String(queueEntry.patient_id));
    if (!matchedPatient || getPatientDownloadPassword(matchedPatient) !== password) {
      return NextResponse.json({ error: 'Invalid download password.' }, { status: 403 });
    }

    const releasedReport = await getReleasedReportPath(supabase, String(queueEntry.visit_id));
    if ('error' in releasedReport) {
      return NextResponse.json({ error: releasedReport.error }, { status: releasedReport.status });
    }

    const { data: reportFile, error: downloadError } = await supabase.storage
      .from('reports')
      .download(releasedReport.path);

    if (downloadError || !reportFile) {
      throw new Error(downloadError?.message ?? 'Unable to load released PDF.');
    }

    const pdfBytes = new Uint8Array(await reportFile.arrayBuffer());
    const pdfFilename = releasedReport.path.split('/').pop() || 'released-result.pdf';
    const zipFilename = getSafeZipFilename(queueId);
    const zipBytes = createPasswordProtectedZip({
      filename: pdfFilename.endsWith('.pdf') ? pdfFilename : `${pdfFilename}.pdf`,
      contents: pdfBytes,
      password,
      modifiedAt: releasedReport.releasedAt ? new Date(releasedReport.releasedAt) : new Date(),
    });

    return new Response(zipBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to prepare protected PDF download.' },
      { status: 500 }
    );
  }
}
