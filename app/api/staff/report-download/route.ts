import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type ReportStatus = 'draft' | 'validated' | 'released';

async function createReleasedReportDownloadUrl(visitId: string) {
  const supabase = getSupabaseAdminClient();
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

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from('reports')
    .createSignedUrl(releasedReport.pdf_storage_path, 60 * 10, {
      download: true,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    throw new Error(signedUrlError?.message ?? 'Unable to create signed PDF URL.');
  }

  return {
    downloadUrl: signedUrl.signedUrl,
    path: releasedReport.pdf_storage_path,
    expiresInSeconds: 60 * 10,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get('queueId');

    if (!queueId) {
      return NextResponse.json({ error: 'Missing queueId.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .select('visit_id')
      .eq('id', queueId)
      .single();

    if (queueError || !queueEntry) {
      throw new Error(queueError?.message ?? 'Queue entry not found.');
    }

    const signedReport = await createReleasedReportDownloadUrl(String(queueEntry.visit_id));
    if ('error' in signedReport) {
      return NextResponse.json({ error: signedReport.error }, { status: signedReport.status });
    }

    return NextResponse.json({
      downloadUrl: signedReport.downloadUrl,
      path: signedReport.path,
      expiresInSeconds: signedReport.expiresInSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to prepare PDF download.' },
      { status: 500 }
    );
  }
}
