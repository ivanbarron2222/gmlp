import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type DbServiceType = 'pre_employment' | 'check_up' | 'lab';
type DbReportStatus = 'draft' | 'validated' | 'released';

function getManilaDayRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const manilaDate = formatter.format(now);
  const start = new Date(`${manilaDate}T00:00:00+08:00`);
  const end = new Date(`${manilaDate}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function getLast7ManilaDates() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const dates: string[] = [];
  const now = new Date();

  for (let index = 6; index >= 0; index -= 1) {
    const current = new Date(now);
    current.setUTCDate(current.getUTCDate() - index);
    dates.push(formatter.format(current));
  }

  return dates;
}

function formatBucketLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatServiceLabel(service: DbServiceType) {
  switch (service) {
    case 'pre_employment':
      return 'Pre-Employment';
    case 'check_up':
      return 'Check-Up';
    default:
      return 'Lab';
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { startIso, endIso } = getManilaDayRange();
    const last7Dates = getLast7ManilaDates();

    const [
      visitsTodayResponse,
      paymentsTodayResponse,
      reportsTodayResponse,
      pendingLabItemsResponse,
      recentVisitsResponse,
      liveQueueResponse,
      visitsLast7Response,
      reportsPendingResponse,
    ] = await Promise.all([
      supabase
        .from('visits')
        .select('id, created_at, service_type')
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      supabase
        .from('payments')
        .select('amount, paid_at')
        .gte('paid_at', startIso)
        .lt('paid_at', endIso),
      supabase
        .from('reports')
        .select('id, released_at, status')
        .eq('status', 'released')
        .gte('released_at', startIso)
        .lt('released_at', endIso),
      supabase
        .from('lab_order_items')
        .select('id, status')
        .neq('status', 'completed'),
      supabase
        .from('visits')
        .select(`
          id,
          service_type,
          created_at,
          patients!inner(first_name, middle_name, last_name, patient_code),
          queue_entries(queue_number, queue_status)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('queue_entries')
        .select('id, queue_number, current_lane, queue_status, service_type, created_at')
        .neq('queue_status', 'completed')
        .order('created_at', { ascending: true })
        .limit(6),
      supabase
        .from('visits')
        .select('id, created_at, service_type')
        .gte('created_at', new Date(`${last7Dates[0]}T00:00:00+08:00`).toISOString())
        .lt('created_at', endIso),
      supabase
        .from('reports')
        .select(`
          id,
          status,
          created_at,
          lab_orders!inner(
            order_number,
            visits!inner(
              patients!inner(first_name, middle_name, last_name)
            )
          )
        `)
        .in('status', ['draft', 'validated'])
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    for (const response of [
      visitsTodayResponse,
      paymentsTodayResponse,
      reportsTodayResponse,
      pendingLabItemsResponse,
      recentVisitsResponse,
      liveQueueResponse,
      visitsLast7Response,
      reportsPendingResponse,
    ]) {
      if (response.error) {
        throw new Error(response.error.message);
      }
    }

    const visitsToday = visitsTodayResponse.data ?? [];
    const paymentsToday = paymentsTodayResponse.data ?? [];
    const reportsToday = reportsTodayResponse.data ?? [];
    const pendingLabItems = pendingLabItemsResponse.data ?? [];
    const recentVisits = recentVisitsResponse.data ?? [];
    const liveQueue = liveQueueResponse.data ?? [];
    const visitsLast7 = visitsLast7Response.data ?? [];
    const reportsPending = reportsPendingResponse.data ?? [];

    const patientFlowBuckets = Array.from({ length: 8 }, (_, index) => ({
      time: formatBucketLabel(6 + index * 2),
      count: 0,
    }));

    const serviceBreakdownMap = new Map<string, number>([
      ['Pre-Employment', 0],
      ['Check-Up', 0],
      ['Lab', 0],
    ]);

    for (const visit of visitsToday) {
      const manilaDate = new Date(
        new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(String(visit.created_at))).replace(' ', 'T')
      );
      const bucketIndex = Math.max(0, Math.min(7, Math.floor((manilaDate.getHours() - 6) / 2)));
      if (patientFlowBuckets[bucketIndex]) {
        patientFlowBuckets[bucketIndex].count += 1;
      }

      const serviceLabel = formatServiceLabel(visit.service_type as DbServiceType);
      serviceBreakdownMap.set(serviceLabel, (serviceBreakdownMap.get(serviceLabel) ?? 0) + 1);
    }

    const revenueTrend = last7Dates.map((date) => ({
      date,
      label: new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
      }),
      amount: 0,
    }));

    for (const payment of paymentsToday) {
      const amount = Number(payment.amount ?? 0);
      if (Number.isFinite(amount)) {
        const todayPoint = revenueTrend[revenueTrend.length - 1];
        todayPoint.amount += amount;
      }
    }

    for (const paymentDate of last7Dates.slice(0, -1)) {
      const dayStart = new Date(`${paymentDate}T00:00:00+08:00`).toISOString();
      const dayEnd = new Date(`${paymentDate}T00:00:00+08:00`);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const { data, error } = await supabase
        .from('payments')
        .select('amount, paid_at')
        .gte('paid_at', dayStart)
        .lt('paid_at', dayEnd.toISOString());

      if (error) {
        throw new Error(error.message);
      }

      const point = revenueTrend.find((item) => item.date === paymentDate);
      if (!point) {
        continue;
      }

      point.amount = (data ?? []).reduce((sum, row) => {
        const amount = Number(row.amount ?? 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
    }

    return NextResponse.json({
      metrics: {
        patientsToday: visitsToday.length,
        pendingTests: pendingLabItems.length,
        releasedResults: reportsToday.length,
        revenueToday: paymentsToday.reduce((sum, row) => {
          const amount = Number(row.amount ?? 0);
          return Number.isFinite(amount) ? sum + amount : sum;
        }, 0),
      },
      patientFlow: patientFlowBuckets,
      serviceBreakdown: Array.from(serviceBreakdownMap.entries()).map(([service, count]) => ({
        service,
        count,
      })),
      revenueTrend,
      recentPatients: recentVisits.map((visit) => {
        const patient = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
        const queueEntry = Array.isArray(visit.queue_entries) ? visit.queue_entries[0] : visit.queue_entries;
        const name = [patient?.first_name, patient?.middle_name ?? '', patient?.last_name]
          .filter(Boolean)
          .join(' ');

        return {
          id: patient?.patient_code ?? visit.id,
          name,
          requestTime: new Date(String(visit.created_at)).toLocaleTimeString('en-PH', {
            hour: 'numeric',
            minute: '2-digit',
          }),
          status:
            queueEntry?.queue_status === 'completed'
              ? 'released'
              : queueEntry?.queue_status === 'now_serving'
                ? 'processing'
                : 'pending',
          queueNumber: queueEntry?.queue_number ?? 'N/A',
        };
      }),
      liveQueue: liveQueue.map((entry) => ({
        id: String(entry.id),
        queueNumber: String(entry.queue_number),
        currentLane: String(entry.current_lane).replace('_', ' ').toUpperCase(),
        serviceType: formatServiceLabel(entry.service_type as DbServiceType).toUpperCase(),
      })),
      pendingValidations: reportsPending.map((report) => {
        const labOrder = Array.isArray(report.lab_orders) ? report.lab_orders[0] : report.lab_orders;
        const visit = Array.isArray(labOrder?.visits) ? labOrder?.visits[0] : labOrder?.visits;
        const patient = Array.isArray(visit?.patients) ? visit?.patients[0] : visit?.patients;

        return {
          id: String(report.id),
          testName: String(labOrder?.order_number ?? 'LAB REPORT'),
          patient: [patient?.first_name, patient?.middle_name ?? '', patient?.last_name]
            .filter(Boolean)
            .join(' '),
          priority: (report.status as DbReportStatus) === 'validated' ? 'urgent' : 'review',
          action: (report.status as DbReportStatus) === 'validated' ? 'Release Report' : 'Validate Report',
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load dashboard analytics.' },
      { status: 500 }
    );
  }
}
