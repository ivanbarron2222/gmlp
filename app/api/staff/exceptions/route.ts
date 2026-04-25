import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit-events';
import { assertActionPermission, requireStaffContext } from '@/lib/supabase/admin-auth';

type ExceptionAction =
  | 'reopen_visit'
  | 'queue_override'
  | 'patient_correct'
  | 'void_payment'
  | 'refund_payment'
  | 'merge_patient';

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    const body = (await request.json()) as {
      action?: ExceptionAction;
      visitId?: string;
      queueEntryId?: string;
      patientId?: string;
      sourcePatientId?: string;
      targetPatientId?: string;
      invoiceId?: string;
      reason?: string;
      targetLane?: string;
      updates?: Record<string, string | null>;
    };

    if (!body.action || !body.reason?.trim()) {
      return NextResponse.json({ error: 'Exception action and reason are required.' }, { status: 400 });
    }

    const reason = body.reason.trim();
    const supabase = context.supabase;

    if (body.action === 'reopen_visit') {
      assertActionPermission(context, 'reopen_visit');
      if (!body.visitId) {
        return NextResponse.json({ error: 'Missing visit to reopen.' }, { status: 400 });
      }

      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .update({ status: 'active', completed_at: null })
        .eq('id', body.visitId)
        .select('id, patient_id')
        .single();

      if (visitError || !visit) {
        throw new Error(visitError?.message ?? 'Visit not found.');
      }

      await recordAuditEvent({
        eventType: 'visit_reopened',
        entityType: 'visit',
        entityId: visit.id,
        visitId: visit.id,
        patientId: String(visit.patient_id),
        actorStaffId: context.userId,
        summary: 'Visit reopened.',
        detail: reason,
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === 'queue_override') {
      assertActionPermission(context, 'override_queue');
      if (!body.queueEntryId || !body.targetLane) {
        return NextResponse.json({ error: 'Missing queue override payload.' }, { status: 400 });
      }

      const { data: queueEntry, error: queueError } = await supabase
        .from('queue_entries')
        .update({
          current_lane: body.targetLane,
          override_reason: reason,
        })
        .eq('id', body.queueEntryId)
        .select('id, visit_id, patient_id')
        .single();

      if (queueError || !queueEntry) {
        throw new Error(queueError?.message ?? 'Queue entry not found.');
      }

      await recordAuditEvent({
        eventType: 'queue_overridden',
        entityType: 'queue_entry',
        entityId: queueEntry.id,
        visitId: String(queueEntry.visit_id),
        patientId: String(queueEntry.patient_id),
        queueEntryId: queueEntry.id,
        actorStaffId: context.userId,
        summary: `Queue overridden to ${body.targetLane}.`,
        detail: reason,
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === 'patient_correct') {
      assertActionPermission(context, 'edit_patient_demographics');
      if (!body.patientId || !body.updates) {
        return NextResponse.json({ error: 'Missing patient correction payload.' }, { status: 400 });
      }

      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .update(body.updates)
        .eq('id', body.patientId)
        .select('id')
        .single();

      if (patientError || !patient) {
        throw new Error(patientError?.message ?? 'Patient not found.');
      }

      await recordAuditEvent({
        eventType: 'patient_corrected',
        entityType: 'patient',
        entityId: patient.id,
        patientId: patient.id,
        actorStaffId: context.userId,
        summary: 'Patient demographics corrected.',
        detail: reason,
        metadata: { updates: body.updates },
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === 'void_payment' || body.action === 'refund_payment') {
      assertActionPermission(context, 'void_payment');
      if (!body.invoiceId) {
        return NextResponse.json({ error: 'Missing invoice payload.' }, { status: 400 });
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .update({ status: 'void' })
        .eq('id', body.invoiceId)
        .select('id, visit_id')
        .single();

      if (invoiceError || !invoice) {
        throw new Error(invoiceError?.message ?? 'Invoice not found.');
      }

      await recordAuditEvent({
        eventType: body.action === 'void_payment' ? 'payment_voided' : 'payment_refunded',
        entityType: 'invoice',
        entityId: invoice.id,
        visitId: String(invoice.visit_id),
        actorStaffId: context.userId,
        summary: body.action === 'void_payment' ? 'Payment voided.' : 'Payment refunded.',
        detail: reason,
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === 'merge_patient') {
      assertActionPermission(context, 'merge_patient');
      if (!body.sourcePatientId || !body.targetPatientId || body.sourcePatientId === body.targetPatientId) {
        return NextResponse.json({ error: 'Missing patient merge payload.' }, { status: 400 });
      }

      const sourcePatientId = body.sourcePatientId;
      const targetPatientId = body.targetPatientId;
      const patientTables = ['visits', 'queue_entries', 'lab_orders', 'reports', 'appointments'];

      for (const table of patientTables) {
        const { error } = await supabase.from(table).update({ patient_id: targetPatientId }).eq('patient_id', sourcePatientId);
        if (error) {
          throw new Error(error.message);
        }
      }

      const { error: selfRegistrationError } = await supabase
        .from('self_registrations')
        .update({ patient_id: targetPatientId })
        .eq('patient_id', sourcePatientId);

      if (selfRegistrationError) {
        throw new Error(selfRegistrationError.message);
      }

      await recordAuditEvent({
        eventType: 'patient_merged',
        entityType: 'patient',
        entityId: targetPatientId,
        patientId: targetPatientId,
        actorStaffId: context.userId,
        summary: 'Merged duplicate patient identity.',
        detail: reason,
        metadata: {
          sourcePatientId,
          targetPatientId,
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unsupported exception action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to execute exception action.' },
      { status: 500 }
    );
  }
}
