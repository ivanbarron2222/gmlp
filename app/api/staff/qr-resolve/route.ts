import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

function extractQueueId(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    const queueId = url.searchParams.get('queueId');
    if (queueId) return queueId;
    const scanMatch = /\/scan\/queue\/([^/?#]+)/.exec(url.pathname);
    if (scanMatch?.[1]) return decodeURIComponent(scanMatch[1]);
  } catch {
    // Not a full URL. Treat the raw value as either a path or the ID.
  }

  const pathMatch = /\/scan\/queue\/([^/?#]+)/.exec(value);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);

  return value;
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireStaffContext(request);
    const body = (await request.json()) as { value?: string };
    const queueId = extractQueueId(String(body.value ?? ''));

    if (!queueId) {
      return NextResponse.json({ error: 'QR code did not contain a queue ID.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('queue_entries')
      .select('id, patient_id, visit_id')
      .eq('id', queueId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Queue record was not found.' }, { status: 404 });
    }

    return NextResponse.json({
      patientId: String(data.patient_id),
      visitId: String(data.visit_id),
      queueEntryId: String(data.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to resolve QR code.' },
      { status: 500 }
    );
  }
}
