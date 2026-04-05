import { NextResponse } from 'next/server';
import { requireAdminStaffAccess } from '@/lib/supabase/admin-auth';

type ActivityLogItem = {
  id: string;
  timestamp: string;
  category: 'queue' | 'results' | 'billing' | 'admin';
  title: string;
  detail: string;
  actor: string;
};

function toActorName(staffId: string | null | undefined, staffById: Map<string, string>) {
  if (!staffId) {
    return 'System';
  }

  return staffById.get(staffId) ?? 'Staff';
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdminStaffAccess(request);

    const [
      staffResponse,
      queueResponse,
      importResponse,
      paymentResponse,
      reportResponse,
      serviceResponse,
      companyResponse,
    ] = await Promise.all([
      supabase.from('staff_profiles').select('id, full_name'),
      supabase
        .from('queue_entries')
        .select(`
          id,
          queue_number,
          created_at,
          completed_at,
          patients!inner(first_name, middle_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('machine_imports')
        .select(`
          id,
          lane,
          created_at,
          imported_by,
          source_order_id,
          visits!inner(
            queue_entries(queue_number),
            patients(first_name, middle_name, last_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('payments')
        .select(`
          id,
          paid_at,
          amount,
          received_by,
          invoices!inner(
            visit_id,
            visits!inner(
              queue_entries(queue_number),
              patients(first_name, middle_name, last_name)
            )
          )
        `)
        .order('paid_at', { ascending: false })
        .limit(100),
      supabase
        .from('reports')
        .select(`
          id,
          status,
          review_notes,
          review_flagged_at,
          validated_at,
          released_at,
          email_sent_at,
          validated_by,
          released_by,
          lab_orders!inner(
            order_number,
            visits!inner(
              queue_entries(queue_number),
              patients(first_name, middle_name, last_name)
            )
          )
        `)
        .order('updated_at', { ascending: false })
        .limit(100),
      supabase
        .from('service_catalog')
        .select('id, service_name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('partner_companies')
        .select('id, company_name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50),
    ]);

    if (staffResponse.error) throw staffResponse.error;
    if (queueResponse.error) throw queueResponse.error;
    if (importResponse.error) throw importResponse.error;
    if (paymentResponse.error) throw paymentResponse.error;
    if (reportResponse.error) throw reportResponse.error;
    if (serviceResponse.error) throw serviceResponse.error;
    if (companyResponse.error) throw companyResponse.error;

    const staffById = new Map<string, string>(
      (staffResponse.data ?? []).map((staff) => [String(staff.id), String(staff.full_name ?? 'Staff')])
    );

    const getPatientName = (patient: unknown) => {
      const row = Array.isArray(patient) ? patient[0] : patient;
      if (!row || typeof row !== 'object') {
        return 'Unknown Patient';
      }

      const data = row as {
        first_name?: string | null;
        middle_name?: string | null;
        last_name?: string | null;
      };

      return [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ');
    };

    const getQueueNumber = (queueEntries: unknown) => {
      const row = Array.isArray(queueEntries) ? queueEntries[0] : queueEntries;
      if (!row || typeof row !== 'object') {
        return 'N/A';
      }

      return String((row as { queue_number?: string | null }).queue_number ?? 'N/A');
    };

    const items: ActivityLogItem[] = [];

    for (const row of queueResponse.data ?? []) {
      const patientName = getPatientName(row.patients);
      items.push({
        id: `queue-created-${row.id}`,
        timestamp: String(row.created_at),
        category: 'queue',
        title: 'Patient queued',
        detail: `${String(row.queue_number)} | ${patientName}`,
        actor: 'Front Desk',
      });

      if (row.completed_at) {
        items.push({
          id: `queue-completed-${row.id}`,
          timestamp: String(row.completed_at),
          category: 'queue',
          title: 'Queue completed',
          detail: `${String(row.queue_number)} | ${patientName}`,
          actor: 'System',
        });
      }
    }

    for (const row of importResponse.data ?? []) {
      const visit = Array.isArray(row.visits) ? row.visits[0] : row.visits;
      const patientName = getPatientName(visit?.patients);
      const queueNumber = getQueueNumber(visit?.queue_entries);
      items.push({
        id: `import-${row.id}`,
        timestamp: String(row.created_at),
        category: 'results',
        title: 'Machine result uploaded',
        detail: `${queueNumber} | ${patientName} | ${String(row.lane).replace('_', ' ').toUpperCase()} | ${String(row.source_order_id ?? 'No order id')}`,
        actor: toActorName(String(row.imported_by ?? ''), staffById),
      });
    }

    for (const row of paymentResponse.data ?? []) {
      const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
      const visit = Array.isArray(invoice?.visits) ? invoice?.visits[0] : invoice?.visits;
      const patientName = getPatientName(visit?.patients);
      const queueNumber = getQueueNumber(visit?.queue_entries);
      items.push({
        id: `payment-${row.id}`,
        timestamp: String(row.paid_at),
        category: 'billing',
        title: 'Payment processed',
        detail: `${queueNumber} | ${patientName} | Amount ${String(row.amount ?? '')}`,
        actor: toActorName(String(row.received_by ?? ''), staffById),
      });
    }

    for (const row of reportResponse.data ?? []) {
      const labOrder = Array.isArray(row.lab_orders) ? row.lab_orders[0] : row.lab_orders;
      const visit = Array.isArray(labOrder?.visits) ? labOrder?.visits[0] : labOrder?.visits;
      const patientName = getPatientName(visit?.patients);
      const queueNumber = getQueueNumber(visit?.queue_entries);
      const context = `${queueNumber} | ${patientName} | ${String(labOrder?.order_number ?? 'No lab order')}`;

      if (row.review_flagged_at) {
        items.push({
          id: `report-flagged-${row.id}`,
          timestamp: String(row.review_flagged_at),
          category: 'results',
          title: 'Report flagged for review',
          detail: `${context}${row.review_notes ? ` | ${String(row.review_notes)}` : ''}`,
          actor: toActorName(String(row.validated_by ?? ''), staffById),
        });
      }

      if (row.validated_at) {
        items.push({
          id: `report-validated-${row.id}`,
          timestamp: String(row.validated_at),
          category: 'results',
          title: 'Report validated',
          detail: context,
          actor: toActorName(String(row.validated_by ?? ''), staffById),
        });
      }

      if (row.released_at) {
        items.push({
          id: `report-released-${row.id}`,
          timestamp: String(row.released_at),
          category: 'results',
          title: 'Report released',
          detail: context,
          actor: toActorName(String(row.released_by ?? ''), staffById),
        });
      }

      if (row.email_sent_at) {
        items.push({
          id: `report-emailed-${row.id}`,
          timestamp: String(row.email_sent_at),
          category: 'results',
          title: 'Released report emailed',
          detail: context,
          actor: 'System',
        });
      }
    }

    for (const row of serviceResponse.data ?? []) {
      items.push({
        id: `service-${row.id}`,
        timestamp: String(row.updated_at),
        category: 'admin',
        title: 'Service pricing updated',
        detail: String(row.service_name ?? 'Service Catalog Entry'),
        actor: 'Admin',
      });
    }

    for (const row of companyResponse.data ?? []) {
      items.push({
        id: `company-${row.id}`,
        timestamp: String(row.updated_at),
        category: 'admin',
        title: 'Partner company updated',
        detail: String(row.company_name ?? 'Partner Company'),
        actor: 'Admin',
      });
    }

    items.sort((left, right) => right.timestamp.localeCompare(left.timestamp));

    return NextResponse.json({
      items: items.slice(0, 200),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load activity log.';
    const status = message === 'Admin access required.' || message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
