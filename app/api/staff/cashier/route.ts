import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildDefaultLineItems,
  dbPaymentMethodToUi,
  uiPaymentMethodToDb,
  type BillingRecord,
} from '@/lib/billing';
import { dbLaneToUiLane, dbServiceToUiService } from '@/lib/db-queue';

type QueueCashierRow = {
  id: string;
  queue_number: string;
  service_type: 'pre_employment' | 'check_up' | 'lab';
  requested_lab_service: 'blood_test' | 'drug_test' | 'xray' | null;
  current_lane: 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray';
  queue_status: 'waiting' | 'now_serving' | 'completed' | 'cancelled' | 'skipped';
  counter_name: string | null;
  priority_lane: boolean;
  created_at: string;
  now_serving_at: string | null;
  completed_at: string | null;
  visit_id: string;
  patient_id: string;
  patients:
    | {
        first_name: string;
        middle_name: string | null;
        last_name: string;
        contact_number: string | null;
        email_address: string | null;
      }
    | Array<{
        first_name: string;
        middle_name: string | null;
        last_name: string;
        contact_number: string | null;
        email_address: string | null;
      }>
    | null;
  queue_steps:
    | Array<{
        id: string;
        lane: 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray';
        status: 'pending' | 'serving' | 'completed' | 'skipped' | 'cancelled';
        sort_order: number;
      }>
    | null;
};

function toPatient(row: QueueCashierRow) {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;

  return {
    name: [patient?.first_name, patient?.middle_name ?? '', patient?.last_name].filter(Boolean).join(' '),
    contactNumber: patient?.contact_number ?? '',
    emailAddress: patient?.email_address ?? '',
  };
}

function createInvoiceNumber() {
  return `INV-${Date.now()}`;
}

function createReceiptNumber() {
  return `OR-${Date.now()}`;
}

async function getQueueContext(queueId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      queue_number,
      service_type,
      requested_lab_service,
      current_lane,
      queue_status,
      counter_name,
      priority_lane,
      created_at,
      now_serving_at,
      completed_at,
      visit_id,
      patient_id,
      patients!inner(first_name, middle_name, last_name, contact_number, email_address),
      queue_steps(id, lane, status, sort_order)
    `)
    .eq('id', queueId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Queue entry not found.');
  }

  return {
    supabase,
    queue: data as QueueCashierRow,
  };
}

async function getBillingRecord(
  visitId: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>
): Promise<BillingRecord | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status, subtotal, discount_amount, total_amount, balance_amount')
    .eq('visit_id', visitId)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  if (!invoice) {
    return null;
  }

  const { data: invoiceItems, error: itemsError } = await supabase
    .from('invoice_items')
    .select('source_type, description, line_total')
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('payment_method, paid_at')
    .eq('invoice_id', invoice.id)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    throw new Error(paymentError.message);
  }

  return {
    lineItems: (invoiceItems ?? []).map((item) => ({
      id: item.source_type,
      name: item.description,
      amount: Number(item.line_total ?? 0),
    })),
    subtotal: Number(invoice.subtotal ?? 0),
    discount: Number(invoice.discount_amount ?? 0),
    total: Number(invoice.total_amount ?? 0),
    paymentMethod: dbPaymentMethodToUi(payment?.payment_method),
    paymentStatus: invoice.status === 'paid' ? 'paid' : 'unpaid',
    paidAt: payment?.paid_at ?? undefined,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get('queueId');

    if (!queueId) {
      return NextResponse.json({ error: 'Missing queueId.' }, { status: 400 });
    }

    const { supabase, queue } = await getQueueContext(queueId);
    const patient = toPatient(queue);
    const existingBilling = await getBillingRecord(queue.visit_id, supabase);
    const completedLanes = [...(queue.queue_steps ?? [])]
      .filter((step) => step.status === 'completed')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((step) => dbLaneToUiLane(step.lane));

    return NextResponse.json({
      patient,
      visit: {
        queueNumber: queue.queue_number,
        patientName: patient.name,
        serviceType: dbServiceToUiService(queue.service_type),
        requestedLabService:
          queue.requested_lab_service === 'blood_test'
            ? 'Blood Test'
            : queue.requested_lab_service === 'drug_test'
              ? 'Drug Test'
              : queue.requested_lab_service === 'xray'
                ? 'Xray'
                : '',
        completedLanes,
        visitStatus:
          existingBilling?.paymentStatus === 'paid'
            ? 'paid'
            : queue.queue_status === 'completed'
              ? 'awaiting-payment'
              : 'active',
      },
      billing: existingBilling,
      suggestedLineItems:
        existingBilling?.lineItems ??
        buildDefaultLineItems(
          dbServiceToUiService(queue.service_type),
          queue.requested_lab_service === 'blood_test'
            ? 'Blood Test'
            : queue.requested_lab_service === 'drug_test'
              ? 'Drug Test'
              : queue.requested_lab_service === 'xray'
                ? 'Xray'
                : '',
          completedLanes
        ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load cashier context.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      queueId?: string;
      billing?: BillingRecord;
    };

    if (!body.queueId || !body.billing) {
      return NextResponse.json({ error: 'Missing billing payload.' }, { status: 400 });
    }

    const { supabase, queue } = await getQueueContext(body.queueId);
    const billing = body.billing;

    const { data: existingInvoice, error: existingInvoiceError } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('visit_id', queue.visit_id)
      .maybeSingle();

    if (existingInvoiceError) {
      throw new Error(existingInvoiceError.message);
    }

    const invoicePayload = {
      visit_id: queue.visit_id,
      patient_id: queue.patient_id,
      status: billing.paymentStatus === 'paid' ? 'paid' : 'unpaid',
      subtotal: billing.subtotal,
      discount_amount: billing.discount,
      total_amount: billing.total,
      balance_amount: billing.paymentStatus === 'paid' ? 0 : billing.total,
      notes: null,
    };

    let invoiceId = existingInvoice?.id ?? null;

    if (invoiceId) {
      const { error: updateInvoiceError } = await supabase
        .from('invoices')
        .update(invoicePayload)
        .eq('id', invoiceId);

      if (updateInvoiceError) {
        throw new Error(updateInvoiceError.message);
      }

      const { error: deleteItemsError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);

      if (deleteItemsError) {
        throw new Error(deleteItemsError.message);
      }

      const { error: deletePaymentsError } = await supabase
        .from('payments')
        .delete()
        .eq('invoice_id', invoiceId);

      if (deletePaymentsError) {
        throw new Error(deletePaymentsError.message);
      }
    } else {
      const { data: createdInvoice, error: createInvoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: createInvoiceNumber(),
          ...invoicePayload,
        })
        .select('id')
        .single();

      if (createInvoiceError || !createdInvoice) {
        throw new Error(createInvoiceError?.message ?? 'Unable to create invoice.');
      }

      invoiceId = createdInvoice.id;
    }

    const { error: insertItemsError } = await supabase.from('invoice_items').insert(
      billing.lineItems.map((item) => ({
        invoice_id: invoiceId,
        source_type: item.id,
        source_id: null,
        description: item.name,
        quantity: 1,
        unit_price: item.amount,
        line_total: item.amount,
      }))
    );

    if (insertItemsError) {
      throw new Error(insertItemsError.message);
    }

    if (billing.paymentStatus === 'paid') {
      const { error: paymentError } = await supabase.from('payments').insert({
        invoice_id: invoiceId,
        amount: billing.total,
        payment_method: uiPaymentMethodToDb(billing.paymentMethod),
        official_receipt_number: createReceiptNumber(),
        paid_at: billing.paidAt ?? new Date().toISOString(),
      });

      if (paymentError) {
        throw new Error(paymentError.message);
      }
    }

    return NextResponse.json({
      billing,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save billing.' },
      { status: 500 }
    );
  }
}
