import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function getAppUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  return new URL(request.url).origin.replace(/\/+$/, '');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      queueId?: string;
    };

    if (!body.queueId) {
      return NextResponse.json({ error: 'Missing queueId.' }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const emailFrom = process.env.EMAIL_FROM?.trim();

    if (!resendApiKey || !emailFrom) {
      return NextResponse.json(
        { error: 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .select('id, queue_number, visit_id, patient_id')
      .eq('id', body.queueId)
      .single();

    if (queueError || !queueEntry) {
      throw new Error(queueError?.message ?? 'Queue entry not found.');
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('first_name, middle_name, last_name, email_address')
      .eq('id', queueEntry.patient_id)
      .single();

    if (patientError || !patient) {
      throw new Error(patientError?.message ?? 'Patient not found.');
    }

    if (!patient.email_address) {
      return NextResponse.json({ error: 'Patient does not have an email address.' }, { status: 400 });
    }

    const { data: labOrders, error: ordersError } = await supabase
      .from('lab_orders')
      .select('id')
      .eq('visit_id', queueEntry.visit_id);

    if (ordersError) {
      throw new Error(ordersError.message);
    }

    const labOrderIds = (labOrders ?? []).map((order) => order.id);
    if (labOrderIds.length === 0) {
      return NextResponse.json({ error: 'No report orders found for this visit.' }, { status: 400 });
    }

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, status')
      .in('lab_order_id', labOrderIds);

    if (reportsError) {
      throw new Error(reportsError.message);
    }

    if (!(reports ?? []).every((report) => report.status === 'released')) {
      return NextResponse.json(
        { error: 'Only released reports can be emailed to patients.' },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl(request);
    const reportUrl = `${appUrl}/report/${encodeURIComponent(body.queueId)}`;
    const patientName = [patient.first_name, patient.middle_name ?? '', patient.last_name]
      .filter(Boolean)
      .join(' ');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [patient.email_address],
        subject: `Your laboratory result is ready - ${queueEntry.queue_number}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6">
            <h2 style="margin:0 0 12px">Laboratory Result Ready</h2>
            <p>Hello ${patientName || 'Patient'},</p>
            <p>Your laboratory result for queue <strong>${queueEntry.queue_number}</strong> is now available.</p>
            <p>You may view the soft copy using the secure link below:</p>
            <p><a href="${reportUrl}">${reportUrl}</a></p>
            <p>If you have questions, please contact Globalife Medical Laboratory &amp; Polyclinic.</p>
          </div>
        `,
      }),
    });

    const resendPayload = (await resendResponse.json().catch(() => null)) as
      | { error?: { message?: string }; id?: string }
      | null;

    if (!resendResponse.ok) {
      throw new Error(resendPayload?.error?.message ?? 'Unable to send report email.');
    }

    const now = new Date().toISOString();
    const { error: updateReportsError } = await supabase
      .from('reports')
      .update({
        email_sent_at: now,
      })
      .in('lab_order_id', labOrderIds);

    if (updateReportsError) {
      throw new Error(updateReportsError.message);
    }

    return NextResponse.json({
      success: true,
      emailSentAt: now,
      providerId: resendPayload?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to send report email.' },
      { status: 500 }
    );
  }
}
