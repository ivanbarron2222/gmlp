import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { dbPaymentMethodToUi, type BillingRecord } from '@/lib/billing';
import { dbLaneToUiLane, dbStatusToUiStatus } from '@/lib/db-queue';
import type {
  MachineResultImport,
  PatientRecord,
  VisitRecord,
  VisitServiceType,
} from '@/lib/patient-record-types';
import type { QueueLane, QueueStatus } from '@/lib/queue-store';

type DbServiceType = 'pre_employment' | 'check_up' | 'lab';
type DbLabService = 'blood_test' | 'drug_test' | 'xray' | null;
type DbGender = 'male' | 'female' | 'other';
type DbQueueLane = 'general' | 'priority_lane' | 'blood_test' | 'drug_test' | 'doctor' | 'xray';
type DbQueueStatus = 'waiting' | 'now_serving' | 'completed' | 'cancelled' | 'skipped';
type DbQueueStepStatus = 'pending' | 'serving' | 'completed' | 'skipped' | 'cancelled';
type DbInvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'void';
type DbResultFlag = 'normal' | 'abnormal' | 'critical' | 'unknown';

type PatientRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  company: string | null;
  birth_date: string;
  gender: DbGender;
  contact_number: string | null;
  email_address: string | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  created_at: string;
};

type VisitRow = {
  id: string;
  patient_id: string;
  service_type: DbServiceType;
  requested_lab_service: DbLabService;
  status: 'active' | 'completed' | 'cancelled';
  current_lane: DbQueueLane;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LabOrderRow = {
  id: string;
  visit_id: string;
  order_number: string;
};

type QueueEntryRow = {
  id: string;
  visit_id: string;
  queue_number: string;
  current_lane: DbQueueLane;
  queue_status: DbQueueStatus;
  created_at: string;
};

type QueueStepRow = {
  id: string;
  visit_id: string;
  queue_entry_id: string;
  lane: DbQueueLane;
  status: DbQueueStepStatus;
  sort_order: number;
};

type InvoiceRow = {
  id: string;
  visit_id: string;
  status: DbInvoiceStatus;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  source_type: string;
  description: string;
  line_total: number | string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  payment_method: string;
  paid_at: string | null;
};

type MachineImportRow = {
  id: string;
  visit_id: string;
  lane: 'blood_test' | 'drug_test' | 'xray';
  source_order_id: string | null;
  source_sample_id: string | null;
  raw_content: string;
  parsed_payload: {
    testName?: string;
    orderId?: string;
    patientName?: string;
  } | null;
  created_at: string;
};

type ResultItemRow = {
  id: string;
  machine_import_id: string | null;
  analyte_name: string;
  result_value: string;
  unit: string | null;
  reference_range: string | null;
  result_flag: DbResultFlag;
};

function toVisitServiceType(service: DbServiceType): VisitServiceType {
  switch (service) {
    case 'pre_employment':
      return 'Pre-Employment';
    case 'check_up':
      return 'Check-Up';
    default:
      return 'Lab';
  }
}

function toRequestedLabService(service: DbLabService) {
  switch (service) {
    case 'blood_test':
      return 'Blood Test';
    case 'drug_test':
      return 'Drug Test';
    case 'xray':
      return 'Xray';
    default:
      return '';
  }
}

function toGender(value: DbGender) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toNumber(value: number | string | null | undefined) {
  const nextValue = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(nextValue) ? Number(nextValue) : 0;
}

function buildVisitStatus(
  queueStatus: QueueStatus,
  completedLanes: QueueLane[],
  billingStatus: 'unpaid' | 'paid' | null,
  visitStatus: VisitRow['status']
): VisitRecord['visitStatus'] {
  if (billingStatus === 'paid') {
    return 'paid';
  }

  if (queueStatus === 'completed' || visitStatus === 'completed') {
    return 'awaiting-payment';
  }

  if (completedLanes.length > 0 || queueStatus === 'serving') {
    return 'in-progress';
  }

  return 'queued';
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: patientsData, error: patientsError } = await supabase
      .from('patients')
      .select(`
        id,
        first_name,
        middle_name,
        last_name,
        company,
        birth_date,
        gender,
        contact_number,
        email_address,
        street_address,
        city,
        province,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (patientsError) {
      throw new Error(patientsError.message);
    }

    const patients = (patientsData ?? []) as PatientRow[];
    if (patients.length === 0) {
      return NextResponse.json({ records: [] });
    }

    const patientIds = patients.map((patient) => patient.id);

    const { data: visitsData, error: visitsError } = await supabase
      .from('visits')
      .select(`
        id,
        patient_id,
        service_type,
        requested_lab_service,
        status,
        current_lane,
        notes,
        created_at,
        updated_at
      `)
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false });

    if (visitsError) {
      throw new Error(visitsError.message);
    }

    const visits = (visitsData ?? []) as VisitRow[];
    const visitIds = visits.map((visit) => visit.id);

    if (visitIds.length === 0) {
      const records: PatientRecord[] = patients.map((patient) => ({
        id: patient.id,
        firstName: patient.first_name,
        middleName: patient.middle_name ?? '',
        lastName: patient.last_name,
        company: patient.company ?? '',
        birthDate: patient.birth_date,
        gender: toGender(patient.gender),
        contactNumber: patient.contact_number ?? '',
        emailAddress: patient.email_address ?? '',
        streetAddress: patient.street_address ?? '',
        city: patient.city ?? '',
        province: patient.province ?? '',
        createdAt: patient.created_at,
        visits: [],
      }));

      return NextResponse.json({ records });
    }

    const [
      queueEntriesResponse,
      queueStepsResponse,
      invoicesResponse,
      machineImportsResponse,
      labOrdersResponse,
    ] = await Promise.all([
      supabase
        .from('queue_entries')
        .select('id, visit_id, queue_number, current_lane, queue_status, created_at')
        .in('visit_id', visitIds),
      supabase
        .from('queue_steps')
        .select('id, visit_id, queue_entry_id, lane, status, sort_order')
        .in('visit_id', visitIds)
        .order('sort_order', { ascending: true }),
      supabase
        .from('invoices')
        .select('id, visit_id, status, subtotal, discount_amount, total_amount')
        .in('visit_id', visitIds),
      supabase
        .from('machine_imports')
        .select('id, visit_id, lane, source_order_id, source_sample_id, raw_content, parsed_payload, created_at')
        .in('visit_id', visitIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('lab_orders')
        .select('id, visit_id, order_number')
        .in('visit_id', visitIds)
        .order('created_at', { ascending: true }),
    ]);

    if (queueEntriesResponse.error) {
      throw new Error(queueEntriesResponse.error.message);
    }
    if (queueStepsResponse.error) {
      throw new Error(queueStepsResponse.error.message);
    }
    if (invoicesResponse.error) {
      throw new Error(invoicesResponse.error.message);
    }
    if (machineImportsResponse.error) {
      throw new Error(machineImportsResponse.error.message);
    }
    if (labOrdersResponse.error) {
      throw new Error(labOrdersResponse.error.message);
    }

    const queueEntries = (queueEntriesResponse.data ?? []) as QueueEntryRow[];
    const queueSteps = (queueStepsResponse.data ?? []) as QueueStepRow[];
    const invoices = (invoicesResponse.data ?? []) as InvoiceRow[];
    const machineImports = (machineImportsResponse.data ?? []) as MachineImportRow[];
    const labOrders = (labOrdersResponse.data ?? []) as LabOrderRow[];

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const machineImportIds = machineImports.map((machineImport) => machineImport.id);

    const [invoiceItemsResponse, paymentsResponse, resultItemsResponse] = await Promise.all([
      invoiceIds.length > 0
        ? supabase
            .from('invoice_items')
            .select('id, invoice_id, source_type, description, line_total')
            .in('invoice_id', invoiceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length > 0
        ? supabase
            .from('payments')
            .select('id, invoice_id, payment_method, paid_at')
            .in('invoice_id', invoiceIds)
            .order('paid_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      machineImportIds.length > 0
        ? supabase
            .from('result_items')
            .select('id, machine_import_id, analyte_name, result_value, unit, reference_range, result_flag')
            .in('machine_import_id', machineImportIds)
            .order('display_order', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (invoiceItemsResponse.error) {
      throw new Error(invoiceItemsResponse.error.message);
    }
    if (paymentsResponse.error) {
      throw new Error(paymentsResponse.error.message);
    }
    if (resultItemsResponse.error) {
      throw new Error(resultItemsResponse.error.message);
    }

    const invoiceItems = (invoiceItemsResponse.data ?? []) as InvoiceItemRow[];
    const payments = (paymentsResponse.data ?? []) as PaymentRow[];
    const resultItems = (resultItemsResponse.data ?? []) as ResultItemRow[];

    const queueByVisitId = new Map(queueEntries.map((entry) => [entry.visit_id, entry]));
    const stepsByVisitId = new Map<string, QueueStepRow[]>();
    const invoiceByVisitId = new Map(invoices.map((invoice) => [invoice.visit_id, invoice]));
    const invoiceItemsByInvoiceId = new Map<string, InvoiceItemRow[]>();
    const paymentByInvoiceId = new Map<string, PaymentRow>();
    const importsByVisitId = new Map<string, MachineImportRow[]>();
    const labNumbersByVisitId = new Map<string, string[]>();
    const resultsByImportId = new Map<string, ResultItemRow[]>();

    for (const step of queueSteps) {
      const visitSteps = stepsByVisitId.get(step.visit_id) ?? [];
      visitSteps.push(step);
      stepsByVisitId.set(step.visit_id, visitSteps);
    }

    for (const item of invoiceItems) {
      const items = invoiceItemsByInvoiceId.get(item.invoice_id) ?? [];
      items.push(item);
      invoiceItemsByInvoiceId.set(item.invoice_id, items);
    }

    for (const payment of payments) {
      if (!paymentByInvoiceId.has(payment.invoice_id)) {
        paymentByInvoiceId.set(payment.invoice_id, payment);
      }
    }

    for (const machineImport of machineImports) {
      const visitImports = importsByVisitId.get(machineImport.visit_id) ?? [];
      visitImports.push(machineImport);
      importsByVisitId.set(machineImport.visit_id, visitImports);
    }

    for (const labOrder of labOrders) {
      const visitLabNumbers = labNumbersByVisitId.get(labOrder.visit_id) ?? [];
      visitLabNumbers.push(labOrder.order_number);
      labNumbersByVisitId.set(labOrder.visit_id, visitLabNumbers);
    }

    for (const resultItem of resultItems) {
      if (!resultItem.machine_import_id) {
        continue;
      }

      const importResults = resultsByImportId.get(resultItem.machine_import_id) ?? [];
      importResults.push(resultItem);
      resultsByImportId.set(resultItem.machine_import_id, importResults);
    }

    const records: PatientRecord[] = patients.map((patient) => {
      const patientVisits = visits
        .filter((visit) => visit.patient_id === patient.id)
        .map((visit): VisitRecord => {
          const queueEntry = queueByVisitId.get(visit.id);
          const labNumbers = labNumbersByVisitId.get(visit.id) ?? [];
          const visitSteps = [...(stepsByVisitId.get(visit.id) ?? [])].sort(
            (left, right) => left.sort_order - right.sort_order
          );
          const pendingLanes = visitSteps
            .filter((step) => step.status === 'pending' || step.status === 'serving')
            .map((step) => dbLaneToUiLane(step.lane));
          const completedLanes = visitSteps
            .filter((step) => step.status === 'completed')
            .map((step) => dbLaneToUiLane(step.lane));
          const invoice = invoiceByVisitId.get(visit.id);
          const payment = invoice ? paymentByInvoiceId.get(invoice.id) : undefined;
          const machineResults: MachineResultImport[] = (importsByVisitId.get(visit.id) ?? []).map(
            (machineImport) => ({
              id: machineImport.id,
              lane: dbLaneToUiLane(machineImport.lane) as MachineResultImport['lane'],
              importedAt: machineImport.created_at,
              orderId:
                machineImport.source_order_id ??
                machineImport.source_sample_id ??
                machineImport.parsed_payload?.orderId ??
                '',
              patientName:
                machineImport.parsed_payload?.patientName ??
                [patient.first_name, patient.middle_name ?? '', patient.last_name]
                  .filter(Boolean)
                  .join(' '),
              testName: machineImport.parsed_payload?.testName ?? 'Machine Import',
              rawText: machineImport.raw_content,
              results: (resultsByImportId.get(machineImport.id) ?? []).map((resultItem) => ({
                name: resultItem.analyte_name,
                value: resultItem.result_value,
                unit: resultItem.unit ?? '',
                referenceRange: resultItem.reference_range ?? '',
                flag: resultItem.result_flag,
              })),
            })
          );

          const billing: BillingRecord | null = invoice
            ? {
                lineItems: (invoiceItemsByInvoiceId.get(invoice.id) ?? []).map((item) => ({
                  id: item.source_type || item.id,
                  name: item.description,
                  amount: toNumber(item.line_total),
                })),
                subtotal: toNumber(invoice.subtotal),
                discount: toNumber(invoice.discount_amount),
                total: toNumber(invoice.total_amount),
                paymentMethod: dbPaymentMethodToUi(payment?.payment_method),
                paymentStatus: invoice.status === 'paid' ? 'paid' : 'unpaid',
                paidAt: payment?.paid_at ?? undefined,
              }
            : null;

          const queueStatus = queueEntry
            ? dbStatusToUiStatus(queueEntry.queue_status as DbQueueStatus)
            : ('waiting' as QueueStatus);
          const currentLane = queueEntry
            ? dbLaneToUiLane(queueEntry.current_lane)
            : dbLaneToUiLane(visit.current_lane);

          return {
            id: visit.id,
            queueEntryId: queueEntry?.id ?? '',
            queueNumber: queueEntry?.queue_number ?? 'Unassigned',
            labNumbers,
            patientName: [patient.first_name, patient.middle_name ?? '', patient.last_name]
              .filter(Boolean)
              .join(' '),
            serviceType: toVisitServiceType(visit.service_type),
            requestedLabService: toRequestedLabService(visit.requested_lab_service),
            notes: visit.notes ?? '',
            currentLane,
            pendingLanes,
            completedLanes,
            queueStatus,
            visitStatus: buildVisitStatus(queueStatus, completedLanes, billing?.paymentStatus ?? null, visit.status),
            createdAt: queueEntry?.created_at ?? visit.created_at,
            updatedAt: visit.updated_at,
            billing,
            machineResults,
          };
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      return {
        id: patient.id,
        firstName: patient.first_name,
        middleName: patient.middle_name ?? '',
        lastName: patient.last_name,
        company: patient.company ?? '',
        birthDate: patient.birth_date,
        gender: toGender(patient.gender),
        contactNumber: patient.contact_number ?? '',
        emailAddress: patient.email_address ?? '',
        streetAddress: patient.street_address ?? '',
        city: patient.city ?? '',
        province: patient.province ?? '',
        createdAt: patient.created_at,
        visits: patientVisits,
      };
    });

    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load patient records.' },
      { status: 500 }
    );
  }
}
