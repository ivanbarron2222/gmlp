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
  requested_lab_service: 'blood_test' | 'drug_test' | 'xray' | 'ecg' | null;
  current_lane: 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray' | 'ecg';
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
        lane: 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray' | 'ecg';
        status: 'pending' | 'serving' | 'completed' | 'skipped' | 'cancelled';
        sort_order: number;
      }>
    | null;
};

type PendingBillingItem = {
  queueId: string;
  queueNumber: string;
  patientName: string;
  serviceType: string;
  requestedLabService: string;
  currentLane: string;
  visitStatus: string;
  labNumbers: string[];
  createdAt: string;
  paymentStatus: 'paid' | 'unpaid';
};

type PendingBillingRow = Pick<
  QueueCashierRow,
  | 'id'
  | 'queue_number'
  | 'service_type'
  | 'requested_lab_service'
  | 'current_lane'
  | 'queue_status'
  | 'created_at'
  | 'visit_id'
  | 'patients'
>;

function toPatient(row: Pick<QueueCashierRow, 'patients'>) {
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

async function getPendingBillingItems(
  supabase: ReturnType<typeof getSupabaseAdminClient>
): Promise<PendingBillingItem[]> {
  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      queue_number,
      service_type,
      requested_lab_service,
      current_lane,
      queue_status,
      created_at,
      visit_id,
      patients!inner(first_name, middle_name, last_name)
    `)
    .neq('queue_status', 'cancelled')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as PendingBillingRow[];

  const labNumbersByVisitId = new Map<string, string[]>();
  const invoiceByVisitId = new Map<string, 'draft' | 'unpaid' | 'paid' | 'void'>();
  const visitIds = rows.map((row) => row.visit_id).filter(Boolean);

  if (visitIds.length > 0) {
    const { data: orderRows, error: ordersError } = await supabase
      .from('lab_orders')
      .select('visit_id, order_number')
      .in('visit_id', visitIds)
      .order('created_at', { ascending: true });

    if (ordersError) {
      throw new Error(ordersError.message);
    }

    for (const order of orderRows ?? []) {
      const visitId = String(order.visit_id ?? '');
      if (!visitId) {
        continue;
      }

      const current = labNumbersByVisitId.get(visitId) ?? [];
      current.push(String(order.order_number ?? '').trim());
      labNumbersByVisitId.set(visitId, current.filter(Boolean));
    }

    const { data: invoiceRows, error: invoicesError } = await supabase
      .from('invoices')
      .select('visit_id, status, created_at')
      .in('visit_id', visitIds)
      .order('created_at', { ascending: false });

    if (invoicesError) {
      throw new Error(invoicesError.message);
    }

    for (const invoice of invoiceRows ?? []) {
      const visitId = String(invoice.visit_id ?? '');
      if (!visitId || invoiceByVisitId.has(visitId)) {
        continue;
      }

      invoiceByVisitId.set(visitId, invoice.status as 'draft' | 'unpaid' | 'paid' | 'void');
    }
  }

  return rows
    .map((row) => {
      const paymentStatus: PendingBillingItem['paymentStatus'] =
        invoiceByVisitId.get(String(row.visit_id)) === 'paid' ? 'paid' : 'unpaid';

      return {
        queueId: String(row.id),
        queueNumber: String(row.queue_number),
        patientName: toPatient(row).name,
        serviceType: dbServiceToUiService(row.service_type),
        requestedLabService:
          row.requested_lab_service === 'blood_test'
            ? 'Blood Test'
            : row.requested_lab_service === 'drug_test'
              ? 'Drug Test'
              : row.requested_lab_service === 'xray'
                ? 'Xray'
                : row.requested_lab_service === 'ecg'
                  ? 'ECG'
                  : '',
        currentLane: dbLaneToUiLane(row.current_lane),
        visitStatus: row.queue_status === 'completed' ? 'awaiting-payment' : 'active',
        labNumbers: labNumbersByVisitId.get(String(row.visit_id)) ?? [],
        createdAt: String(row.created_at),
        paymentStatus,
      };
    })
    .filter((row) => row.paymentStatus !== 'paid');
}

async function getLabNumbers(
  visitId: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>
) {
  const { data, error } = await supabase
    .from('lab_orders')
    .select('order_number')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => String(row.order_number ?? '').trim())
    .filter(Boolean);
}

async function getBillingRecord(
  visitId: string,
  supabase: ReturnType<typeof getSupabaseAdminClient>
): Promise<BillingRecord | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, subtotal, discount_amount, total_amount, balance_amount')
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
    .select('payment_method, paid_at, official_receipt_number')
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
    invoiceNumber: invoice.invoice_number ?? undefined,
    receiptNumber: payment?.official_receipt_number ?? undefined,
    paymentMethod: dbPaymentMethodToUi(payment?.payment_method),
    paymentStatus: invoice.status === 'paid' ? 'paid' : 'unpaid',
    paidAt: payment?.paid_at ?? undefined,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get('queueId');
    const supabase = getSupabaseAdminClient();
    const pendingVisits = await getPendingBillingItems(supabase);

    if (!queueId) {
      return NextResponse.json({ pendingVisits, patient: null, visit: null, billing: null, suggestedLineItems: [] });
    }

    const { queue } = await getQueueContext(queueId);
    const patient = toPatient(queue);
    const existingBilling = await getBillingRecord(queue.visit_id, supabase);
    const labNumbers = await getLabNumbers(queue.visit_id, supabase);
    const completedLanes = [...(queue.queue_steps ?? [])]
      .filter((step) => step.status === 'completed')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((step) => dbLaneToUiLane(step.lane));

    return NextResponse.json({
      pendingVisits,
      patient,
      visit: {
        queueNumber: queue.queue_number,
        labNumbers,
        patientName: patient.name,
        serviceType: dbServiceToUiService(queue.service_type),
        requestedLabService:
          queue.requested_lab_service === 'blood_test'
            ? 'Blood Test'
            : queue.requested_lab_service === 'drug_test'
              ? 'Drug Test'
              : queue.requested_lab_service === 'xray'
                ? 'Xray'
                : queue.requested_lab_service === 'ecg'
                  ? 'ECG'
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
                : queue.requested_lab_service === 'ecg'
                  ? 'ECG'
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
    const invoiceNumber = existingInvoice?.invoice_number ?? createInvoiceNumber();
    const receiptNumber =
      billing.paymentStatus === 'paid' ? createReceiptNumber() : undefined;

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
          invoice_number: invoiceNumber,
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
        official_receipt_number: receiptNumber,
        paid_at: billing.paidAt ?? new Date().toISOString(),
      });

      if (paymentError) {
        throw new Error(paymentError.message);
      }
    }

    return NextResponse.json({
      billing: {
        ...billing,
        invoiceNumber,
        receiptNumber,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save billing.' },
      { status: 500 }
    );
  }
}
