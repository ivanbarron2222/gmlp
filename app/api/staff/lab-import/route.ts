import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

type DbLane = 'blood_test' | 'drug_test' | 'xray' | 'ecg';
type UiLane = 'BLOOD TEST' | 'DRUG TEST' | 'XRAY' | 'ECG';
type BloodTestCategory = 'hematology' | 'urinalysis';

type LabOrderItemRow = {
  id: string;
  lab_order_id: string;
  test_name: string;
  test_code: string;
  service_lane: DbLane;
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

function toDbLane(lane: string | null): DbLane | null {
  switch (lane) {
    case 'BLOOD TEST':
      return 'blood_test';
    case 'DRUG TEST':
      return 'drug_test';
    case 'XRAY':
      return 'xray';
    case 'ECG':
      return 'ecg';
    default:
      return null;
  }
}

function toUiLane(lane: string): UiLane {
  switch (lane) {
    case 'blood_test':
      return 'BLOOD TEST';
    case 'drug_test':
      return 'DRUG TEST';
    case 'ecg':
      return 'ECG';
    default:
      return 'XRAY';
  }
}

function normalizeFlag(flag: string) {
  const value = flag.trim().toLowerCase();

  switch (value) {
    case 'n':
    case 'neg':
    case 'negative':
    case 'normal':
    case 'non-reactive':
    case 'nonreactive':
      return 'normal';
    case 'pos':
    case 'positive':
    case 'reactive':
      return 'abnormal';
    case 'h':
    case 'high':
      return 'high';
    case 'l':
    case 'low':
      return 'low';
    case 'critical':
      return 'critical';
    case 'abnormal':
      return 'abnormal';
    default:
      return 'unknown';
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isUrinalysisTestName(value: string) {
  const normalized = normalizeText(value);
  return normalized.includes('urinalysis') || normalized.includes('urine');
}

function isHematologyTestName(value: string) {
  const normalized = normalizeText(value);
  return normalized.includes('cbc') || normalized.includes('hematology') || normalized.includes('blood');
}

function inferBloodTestCategory(
  testName: string,
  results: Array<{ name: string }>
): 'urinalysis' | 'hematology' | 'unknown' {
  if (isUrinalysisTestName(testName)) {
    return 'urinalysis';
  }

  if (isHematologyTestName(testName)) {
    return 'hematology';
  }

  const analytes = results.map((item) => normalizeText(item.name));
  const urinalysisMarkers = new Set([
    'color',
    'turbidity',
    'specific gravity',
    'reaction',
    'ph',
    'sugar',
    'protein',
    'bacteria',
    'epithelial cell',
  ]);
  const hematologyMarkers = new Set([
    'wbc',
    'rbc',
    'hgb',
    'hct',
    'plt',
    'mcv',
    'mch',
    'mchc',
    'rdw',
    'mpv',
  ]);

  if (analytes.some((item) => urinalysisMarkers.has(item) || item.includes('urine'))) {
    return 'urinalysis';
  }

  if (analytes.some((item) => hematologyMarkers.has(item) || item.includes('hemoglobin'))) {
    return 'hematology';
  }

  return 'unknown';
}

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

async function resolveLabOrderItem(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  visitId: string,
  lane: DbLane,
  options?: {
    orderId?: string;
    testName?: string;
    results?: Array<{ name: string }>;
    bloodTestCategory?: BloodTestCategory;
  }
) {
  const { data: laneItems, error: orderItemError } = await supabase
    .from('lab_order_items')
    .select(
      'id, lab_order_id, test_name, test_code, service_lane, lab_orders!inner(id, order_number, visit_id)'
    )
    .eq('lab_orders.visit_id', visitId)
    .eq('service_lane', lane)
    .order('created_at', { ascending: false });

  if (orderItemError) {
    throw new Error(orderItemError.message);
  }

  const items = (laneItems ?? []) as LabOrderItemRow[];
  const normalizedOrderId = normalizeText(options?.orderId ?? '');
  const normalizedTestName = normalizeText(options?.testName ?? '');

  if (normalizedOrderId) {
    const matchedByOrder = items.find((item) => {
      const relatedOrder = getRelatedOrder(item);
      return normalizeText(String(relatedOrder?.order_number ?? '')) === normalizedOrderId;
    });

    if (matchedByOrder) {
      return matchedByOrder;
    }
  }

  if (lane === 'blood_test' && items.length > 0) {
    const inferredCategory =
      options?.bloodTestCategory ??
      inferBloodTestCategory(options?.testName ?? '', options?.results ?? []);

    const matchedByCategory = items.find((item) => {
      const itemName = normalizeText(item.test_name);
      const itemCode = normalizeText(item.test_code);

      if (inferredCategory === 'urinalysis') {
        return (
          isUrinalysisTestName(itemName) ||
          isUrinalysisTestName(itemCode) ||
          itemCode.includes('uri')
        );
      }

      if (inferredCategory === 'hematology') {
        return (
          isHematologyTestName(itemName) ||
          isHematologyTestName(itemCode) ||
          itemCode.includes('cbc')
        );
      }

      return false;
    });

    if (matchedByCategory) {
      return matchedByCategory;
    }
  }

  if (normalizedTestName) {
    const matchedByName = items.find((item) => {
      const itemName = normalizeText(item.test_name);
      const itemCode = normalizeText(item.test_code);
      return itemName.includes(normalizedTestName) || itemCode.includes(normalizedTestName);
    });

    if (matchedByName) {
      return matchedByName;
    }
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length > 1) {
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
    throw new Error(`No lab order found for ${lane}.`);
  }

  const rawTestName = options?.testName?.trim() || (lane === 'blood_test' ? 'CBC' : lane.toUpperCase());
  const testCodeBase =
    lane === 'blood_test'
      ? inferBloodTestCategory(options?.testName ?? '', options?.results ?? []) === 'urinalysis'
        ? 'URI'
        : 'CBC'
      : lane === 'drug_test'
        ? 'DRUG'
        : lane === 'ecg'
          ? 'ECG'
          : 'XRAY';

  const { data: createdItem, error: createItemError } = await supabase
    .from('lab_order_items')
    .insert({
      lab_order_id: latestOrder.id,
      service_lane: lane,
      requested_lab_service:
        lane === 'xray'
          ? 'xray'
          : lane === 'drug_test'
            ? 'drug_test'
            : lane === 'ecg'
              ? 'ecg'
              : 'blood_test',
      test_code: `${testCodeBase}-${Date.now()}`,
      test_name: rawTestName,
      sample_id: `SMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    })
    .select(
      'id, lab_order_id, test_name, test_code, service_lane, lab_orders!inner(id, order_number, visit_id)'
    )
    .single();

  if (createItemError || !createdItem) {
    throw new Error(createItemError?.message ?? `No lab order item found for ${lane}.`);
  }

  return createdItem as LabOrderItemRow;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get('queueId');
    const dbLane = toDbLane(url.searchParams.get('lane'));
    const bloodTestCategory =
      url.searchParams.get('bloodTestCategory') === 'urinalysis' ? 'urinalysis' : 'hematology';

    if (!queueId || !dbLane) {
      return NextResponse.json({ error: 'Missing queueId or lane.' }, { status: 400 });
    }

    const { supabase, queueEntry } = await getQueueContext(queueId);
    const labOrderItem = await resolveLabOrderItem(supabase, queueEntry.visit_id, dbLane, {
      bloodTestCategory: dbLane === 'blood_test' ? bloodTestCategory : undefined,
    });

    const { data: machineImport, error: importError } = await supabase
      .from('machine_imports')
      .select('*')
      .eq('lab_order_item_id', labOrderItem.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (importError) {
      throw importError;
    }

    if (!machineImport) {
      return NextResponse.json({ machineImport: null });
    }

    const relatedOrder = getRelatedOrder(labOrderItem);

    const { data: resultItems, error: resultsError } = await supabase
      .from('result_items')
      .select('*')
      .eq('machine_import_id', machineImport.id)
      .order('display_order', { ascending: true });

    if (resultsError) {
      throw resultsError;
    }

    return NextResponse.json({
      machineImport: {
        id: machineImport.id,
        lane: toUiLane(machineImport.lane),
        importedAt: machineImport.created_at,
        orderId: machineImport.source_order_id || String(relatedOrder?.order_number ?? ''),
        patientName: '',
        testName: String((machineImport.parsed_payload as { testName?: string } | null)?.testName ?? labOrderItem.test_name),
        rawText: machineImport.raw_content,
        results: (resultItems ?? []).map((item) => ({
          name: item.analyte_name,
          value: item.result_value,
          unit: item.unit ?? '',
          referenceRange: item.reference_range ?? '',
          flag: item.result_flag ?? 'unknown',
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load machine import.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    const body = (await request.json()) as {
      queueId?: string;
      lane?: UiLane;
      bloodTestCategory?: BloodTestCategory;
      sourceFilename?: string;
      rawText?: string;
      parsedImport?: {
        orderId: string;
        patientName: string;
        testName: string;
        results: Array<{
          name: string;
          value: string;
          unit: string;
          referenceRange: string;
          flag: string;
        }>;
      };
    };

    if (!body.queueId || !body.lane || !body.rawText || !body.parsedImport) {
      return NextResponse.json({ error: 'Missing import payload.' }, { status: 400 });
    }

    const dbLane = toDbLane(body.lane);

    if (!dbLane) {
      return NextResponse.json({ error: 'Unsupported lane.' }, { status: 400 });
    }

    const { supabase, queueEntry } = await getQueueContext(body.queueId);
    const labOrderItem = await resolveLabOrderItem(supabase, queueEntry.visit_id, dbLane, {
      orderId: body.parsedImport.orderId,
      testName: body.parsedImport.testName,
      results: body.parsedImport.results.map((item) => ({ name: item.name })),
      bloodTestCategory: dbLane === 'blood_test' ? body.bloodTestCategory : undefined,
    });
    const relatedOrder = getRelatedOrder(labOrderItem);

    const { data: machineImport, error: importError } = await supabase
      .from('machine_imports')
      .insert({
        lab_order_item_id: labOrderItem.id,
        visit_id: queueEntry.visit_id,
        patient_id: queueEntry.patient_id,
        lane: dbLane,
        import_status: 'accepted',
        source_filename: body.sourceFilename ?? 'machine-result.txt',
        source_order_id: body.parsedImport.orderId || null,
        raw_content: body.rawText,
        parsed_payload: body.parsedImport,
        imported_by: context.userId,
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (importError || !machineImport) {
      throw new Error(importError?.message ?? 'Failed to save machine import.');
    }

    const { error: resultItemsError } = await supabase.from('result_items').insert(
      body.parsedImport.results.map((result, index) => ({
        machine_import_id: machineImport.id,
        lab_order_item_id: labOrderItem.id,
        analyte_name: result.name,
        result_value: result.value,
        unit: result.unit || null,
        reference_range: result.referenceRange || null,
        result_flag: normalizeFlag(result.flag || result.value),
        display_order: index + 1,
      }))
    );

    if (resultItemsError) {
      throw new Error(resultItemsError.message);
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
      machineImport: {
        id: machineImport.id,
        lane: body.lane,
        importedAt: machineImport.created_at,
        orderId: body.parsedImport.orderId || String(relatedOrder?.order_number ?? ''),
        patientName: body.parsedImport.patientName,
        testName: body.parsedImport.testName || labOrderItem.test_name,
        rawText: body.rawText,
        results: body.parsedImport.results,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save machine import.' },
      { status: 500 }
    );
  }
}
