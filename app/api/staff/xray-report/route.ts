import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type LabOrderItemRow = {
  id: string;
  lab_order_id: string;
  test_name: string;
  test_code: string;
  service_lane: 'xray';
  lab_orders:
    | {
        id: string;
        order_number: string;
        visit_id: string;
      }
    | Array<{
        id: string;
        order_number: string;
        visit_id: string;
      }>
    | null;
};

type XrayPayload = {
  orderId?: string;
  testName?: string;
  examType?: string;
  xrayNumber?: string;
  findings?: string[];
  impression?: string;
  remarks?: string;
};

function getRelatedOrder(
  labOrderItem: LabOrderItemRow
): { id: string; order_number: string; visit_id: string } | null {
  return Array.isArray(labOrderItem.lab_orders)
    ? labOrderItem.lab_orders[0] ?? null
    : labOrderItem.lab_orders;
}

async function getQueueContext(queueId: string) {
  const supabase = getSupabaseAdminClient();

  const { data: queueEntry, error: queueError } = await supabase
    .from('queue_entries')
    .select('id, visit_id, patient_id, queue_number')
    .eq('id', queueId)
    .single();

  if (queueError || !queueEntry) {
    throw new Error(queueError?.message ?? 'Queue entry not found.');
  }

  return {
    supabase,
    queueEntry,
  };
}

async function resolveXrayOrderItem(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  visitId: string
) {
  const { data: laneItems, error: orderItemError } = await supabase
    .from('lab_order_items')
    .select(
      'id, lab_order_id, test_name, test_code, service_lane, lab_orders!inner(id, order_number, visit_id)'
    )
    .eq('lab_orders.visit_id', visitId)
    .eq('service_lane', 'xray')
    .order('created_at', { ascending: false });

  if (orderItemError) {
    throw new Error(orderItemError.message);
  }

  const items = (laneItems ?? []) as LabOrderItemRow[];
  if (items.length > 0) {
    return items[0];
  }

  const { data: latestOrder, error: latestOrderError } = await supabase
    .from('lab_orders')
    .select('id, order_number, visit_id')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestOrderError) {
    throw new Error(latestOrderError.message);
  }

  if (!latestOrder) {
    throw new Error('No xray lab order found for this visit.');
  }

  const { data: createdItem, error: createItemError } = await supabase
    .from('lab_order_items')
    .insert({
      lab_order_id: latestOrder.id,
      service_lane: 'xray',
      requested_lab_service: 'xray',
      test_code: `XRAY-${Date.now()}`,
      test_name: 'Chest PA',
      sample_id: `XR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    })
    .select(
      'id, lab_order_id, test_name, test_code, service_lane, lab_orders!inner(id, order_number, visit_id)'
    )
    .single();

  if (createItemError || !createdItem) {
    throw new Error(createItemError?.message ?? 'Unable to create xray order item.');
  }

  return createdItem as LabOrderItemRow;
}

function buildRawContent(payload: Required<Pick<XrayPayload, 'examType' | 'xrayNumber' | 'impression' | 'remarks'>> & { orderId: string; findings: string[] }) {
  const findingsBlock = payload.findings.join('\n');

  return [
    `OrderId: ${payload.orderId}`,
    `ExamType: ${payload.examType}`,
    `XrayNumber: ${payload.xrayNumber}`,
    'Findings:',
    findingsBlock || 'No findings provided.',
    'Impression:',
    payload.impression || 'No impression provided.',
    'Remarks:',
    payload.remarks || 'No remarks provided.',
  ].join('\n');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get('queueId');

    if (!queueId) {
      return NextResponse.json({ error: 'Missing queueId.' }, { status: 400 });
    }

    const { supabase, queueEntry } = await getQueueContext(queueId);
    const labOrderItem = await resolveXrayOrderItem(supabase, queueEntry.visit_id);
    const relatedOrder = getRelatedOrder(labOrderItem);

    const { data: machineImport, error: importError } = await supabase
      .from('machine_imports')
      .select('*')
      .eq('lab_order_item_id', labOrderItem.id)
      .eq('lane', 'xray')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (importError) {
      throw new Error(importError.message);
    }

    if (!machineImport) {
      return NextResponse.json({ xrayReport: null });
    }

    const parsed = ((machineImport.parsed_payload as XrayPayload | null) ?? null) as XrayPayload | null;

    return NextResponse.json({
      xrayReport: {
        id: machineImport.id,
        importedAt: machineImport.created_at,
        orderId: parsed?.orderId || machineImport.source_order_id || String(relatedOrder?.order_number ?? ''),
        examType: parsed?.examType || parsed?.testName || labOrderItem.test_name,
        xrayNumber: parsed?.xrayNumber || '',
        findings: Array.isArray(parsed?.findings) ? parsed?.findings.filter(Boolean) : [],
        impression: parsed?.impression || '',
        remarks: parsed?.remarks || '',
        rawText: machineImport.raw_content || '',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load xray report.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      queueId?: string;
      examType?: string;
      xrayNumber?: string;
      findings?: string;
      impression?: string;
      remarks?: string;
    };

    if (!body.queueId || !body.examType?.trim()) {
      return NextResponse.json({ error: 'Missing xray payload.' }, { status: 400 });
    }

    const findings = (body.findings ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (findings.length === 0) {
      return NextResponse.json({ error: 'Findings are required.' }, { status: 400 });
    }

    const { supabase, queueEntry } = await getQueueContext(body.queueId);
    const labOrderItem = await resolveXrayOrderItem(supabase, queueEntry.visit_id);
    const relatedOrder = getRelatedOrder(labOrderItem);
    const payload: XrayPayload = {
      orderId: String(relatedOrder?.order_number ?? ''),
      testName: body.examType.trim(),
      examType: body.examType.trim(),
      xrayNumber: body.xrayNumber?.trim() || '',
      findings,
      impression: body.impression?.trim() || '',
      remarks: body.remarks?.trim() || '',
    };
    const rawContent = buildRawContent({
      orderId: payload.orderId || '',
      examType: payload.examType || '',
      xrayNumber: payload.xrayNumber || '',
      findings,
      impression: payload.impression || '',
      remarks: payload.remarks || '',
    });

    const { data: machineImport, error: importError } = await supabase
      .from('machine_imports')
      .insert({
        lab_order_item_id: labOrderItem.id,
        visit_id: queueEntry.visit_id,
        patient_id: queueEntry.patient_id,
        lane: 'xray',
        import_status: 'accepted',
        source_filename: 'xray-manual-entry.txt',
        source_order_id: payload.orderId || null,
        raw_content: rawContent,
        parsed_payload: payload,
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (importError || !machineImport) {
      throw new Error(importError?.message ?? 'Failed to save xray report.');
    }

    const { error: itemUpdateError } = await supabase
      .from('lab_order_items')
      .update({
        specimen_status: 'completed',
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', labOrderItem.id);

    if (itemUpdateError) {
      throw new Error(itemUpdateError.message);
    }

    return NextResponse.json({
      xrayReport: {
        id: machineImport.id,
        importedAt: machineImport.created_at,
        orderId: payload.orderId || '',
        examType: payload.examType || '',
        xrayNumber: payload.xrayNumber || '',
        findings,
        impression: payload.impression || '',
        remarks: payload.remarks || '',
        rawText: rawContent,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save xray report.' },
      { status: 500 }
    );
  }
}
