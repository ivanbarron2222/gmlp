import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LabReportTemplateData, LabReportSection } from '@/components/common/lab-report-template';

type UiLane = 'BLOOD TEST' | 'DRUG TEST' | 'XRAY';

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function calculateAge(birthDate: string | null | undefined) {
  if (!birthDate) {
    return '';
  }

  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return String(age);
}

function prettifySex(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function mapLaneToSectionTitle(lane: string): string {
  switch (lane) {
    case 'blood_test':
      return 'Hematology';
    case 'drug_test':
      return 'Others';
    case 'xray':
      return 'Xray';
    default:
      return 'Laboratory';
  }
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function formatDisplayTestName(value: string) {
  const cleaned = value.trim();
  const acronymMatch = cleaned.match(/^([A-Z0-9%#+-]{2,20})\s*\(([^)]+)\)$/);

  if (acronymMatch) {
    return acronymMatch[1];
  }

  const withoutParenthetical = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  if (withoutParenthetical) {
    return withoutParenthetical;
  }

  return cleaned;
}

function formatHematologyLabel(value: string) {
  const cleaned = formatDisplayTestName(value);
  const normalized = normalizeLabel(cleaned);

  const explicitLabels = new Map<string, string>([
    ['hgb', 'Hemoglobin'],
    ['hemoglobin', 'Hemoglobin'],
    ['hct', 'Hematocrit'],
    ['hematocrit', 'Hematocrit'],
    ['wbc', 'WBC'],
    ['white blood cells', 'WBC'],
    ['rbc', 'RBC'],
    ['red blood cells', 'RBC'],
    ['neut%', 'Neutrophils'],
    ['neutrophils', 'Neutrophils'],
    ['lymph%', 'Lymphocytes'],
    ['lymphocytes', 'Lymphocytes'],
    ['eos%', 'Eosinophils'],
    ['eosinophils', 'Eosinophils'],
    ['mono%', 'Monocytes'],
    ['monocytes', 'Monocytes'],
    ['stabs', 'Stabs'],
    ['baso%', 'Basophils'],
    ['basophils', 'Basophils'],
    ['plt', 'Platelet Count'],
    ['platelets', 'Platelet Count'],
    ['platelet count', 'Platelet Count'],
    ['blood type', 'Blood Type'],
    ['rh type', 'Rh type'],
    ['esr', 'ESR'],
    ['mcv', 'MCV'],
    ['mch', 'MCH'],
    ['mchc', 'MCHC'],
    ['rdw', 'RDW'],
    ['mpv', 'MPV'],
  ]);

  return explicitLabels.get(normalized) ?? cleaned;
}

function formatUrinalysisLabel(value: string) {
  const cleaned = formatDisplayTestName(value);
  const normalized = normalizeLabel(cleaned);

  const explicitLabels = new Map<string, string>([
    ['color', 'Color'],
    ['turb', 'Turbidity'],
    ['turbidity', 'Turbidity'],
    ['spgr', 'Specific Gravity'],
    ['specific gravity', 'Specific Gravity'],
    ['reaction', 'Reaction'],
    ['ph', 'Reaction'],
    ['sugar', 'Sugar'],
    ['glucose', 'Sugar'],
    ['pro', 'Protein'],
    ['protein', 'Protein'],
    ['rbc', 'RBC'],
    ['wbc', 'WBC'],
    ['bact', 'Bacteria'],
    ['bacteria', 'Bacteria'],
    ['epit', 'Epithelial Cell'],
    ['epithelial cell', 'Epithelial Cell'],
    ['amorphous urates/phosphates', 'Amorphous Urates/Phosphates'],
    ['mucus thread', 'Mucus Thread'],
    ['uric acid', 'Uric Acid'],
    ['calcium oxalate', 'Calcium Oxalate'],
    ['yeast cell', 'Yeast Cell'],
  ]);

  return explicitLabels.get(normalized) ?? cleaned;
}

function sortHematologyRows(section: LabReportSection): LabReportSection {
  const preferredOrder = [
    'Hemoglobin',
    'Hematocrit',
    'WBC',
    'RBC',
    'Neutrophils',
    'Lymphocytes',
    'Eosinophils',
    'Monocytes',
    'Stabs',
    'Basophils',
    'Platelet Count',
    'Blood Type',
    'Rh type',
    'ESR',
  ];

  const groupedKeys = new Set([
    'Neutrophils',
    'Lymphocytes',
    'Eosinophils',
    'Monocytes',
    'Stabs',
    'Basophils',
  ]);

  const rows = [...section.rows].sort((a, b) => {
    const indexA = preferredOrder.indexOf(a.test);
    const indexB = preferredOrder.indexOf(b.test);
    const safeA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const safeB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
    return safeA - safeB;
  });

  const nextRows: LabReportSection['rows'] = [];
  let insertedDifferentialHeader = false;

  for (const row of rows) {
    if (!insertedDifferentialHeader && groupedKeys.has(row.test)) {
      nextRows.push({
        key: 'hematology-differential-count',
        type: 'group',
        test: 'Differential Count',
      });
      insertedDifferentialHeader = true;
    }

    nextRows.push(row);
  }

  return {
    ...section,
    rows: nextRows,
  };
}

function isUrinalysisResult(item: Record<string, unknown>) {
  const analyte = normalizeLabel(String(item.analyte_name ?? ''));
  const importTestName = normalizeLabel(String(item.import_test_name ?? ''));
  const testName = normalizeLabel(String(item.test_name ?? ''));

  if (importTestName.includes('urinalysis') || importTestName.includes('urine')) {
    return true;
  }

  if (testName.includes('urinalysis') || testName.includes('urine')) {
    return true;
  }

  const urinalysisMarkers = new Set([
    'color',
    'turbidity',
    'clarity',
    'specific gravity',
    'reaction',
    'ph',
    'sugar',
    'glucose',
    'protein',
    'ketone',
    'ketones',
    'blood',
    'bilirubin',
    'urobilinogen',
    'nitrite',
    'leukocyte esterase',
    'rbc',
    'wbc',
    'bacteria',
    'epithelial cell',
    'epithelial cells',
    'amorphous urates/phosphates',
    'mucus thread',
    'uric acid',
    'calcium oxalate',
    'yeast cell',
  ]);

  return urinalysisMarkers.has(analyte);
}

function getSectionTitle(item: Record<string, unknown>) {
  const lane = String(item.service_lane ?? '');

  if (lane === 'blood_test' && isUrinalysisResult(item)) {
    return 'Urinalysis';
  }

  return mapLaneToSectionTitle(lane);
}

function mapLaneToUiLane(lane: string): UiLane {
  switch (lane) {
    case 'blood_test':
      return 'BLOOD TEST';
    case 'drug_test':
      return 'DRUG TEST';
    default:
      return 'XRAY';
  }
}

function buildSections(resultItems: Array<Record<string, unknown>>) {
  const sectionsMap = new Map<string, LabReportSection>();

  for (const item of resultItems) {
    const title = getSectionTitle(item);

    if (!sectionsMap.has(title)) {
      sectionsMap.set(title, {
        title,
        rows: [],
      });
    }

    sectionsMap.get(title)!.rows.push({
      key: String(item.id ?? `${title}-${item.analyte_name ?? ''}-${sectionsMap.get(title)!.rows.length}`),
      test:
        title === 'Hematology'
          ? formatHematologyLabel(String(item.analyte_name ?? ''))
          : title === 'Urinalysis'
            ? formatUrinalysisLabel(String(item.analyte_name ?? ''))
          : formatDisplayTestName(String(item.analyte_name ?? '')),
      normalValues: String(item.reference_range ?? ''),
      result: String(item.result_value ?? ''),
      type: 'result',
      flag: String(item.result_flag ?? '') !== 'normal' && String(item.result_flag ?? '') !== 'unknown'
        ? 'abnormal'
        : 'normal',
    });
  }

  const orderedSections = ['Hematology', 'Urinalysis', 'Fecalysis', 'Others'].map((title) => {
    if (title === 'Urinalysis' || title === 'Fecalysis') {
      return sectionsMap.get(title) ?? { title, rows: [] };
    }

    return sectionsMap.get(title) ?? { title, rows: [] };
  });

  return orderedSections.map((section) =>
    section.title === 'Hematology' ? sortHematologyRows(section) : section
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queueId = url.searchParams.get('queueId');

    if (!queueId) {
      return NextResponse.json({ error: 'Missing queueId.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .select('id, queue_number, visit_id, patient_id, created_at')
      .eq('id', queueId)
      .single();

    if (queueError || !queueEntry) {
      throw new Error(queueError?.message ?? 'Queue entry not found.');
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', queueEntry.patient_id)
      .single();

    if (patientError || !patient) {
      throw new Error(patientError?.message ?? 'Patient not found.');
    }

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('*')
      .eq('id', queueEntry.visit_id)
      .single();

    if (visitError || !visit) {
      throw new Error(visitError?.message ?? 'Visit not found.');
    }

    const { data: labOrders, error: labOrdersError } = await supabase
      .from('lab_orders')
      .select('id, order_number, status, created_at')
      .eq('visit_id', visit.id)
      .order('created_at', { ascending: false });

    if (labOrdersError) {
      throw new Error(labOrdersError.message);
    }

    const labOrderIds = (labOrders ?? []).map((order) => order.id);

    const { data: labOrderItems, error: itemsError } = await supabase
      .from('lab_order_items')
      .select('id, lab_order_id, service_lane, test_name, test_code')
      .in('lab_order_id', labOrderIds.length > 0 ? labOrderIds : ['00000000-0000-0000-0000-000000000000']);

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    const labOrderItemIds = (labOrderItems ?? []).map((item) => item.id);

    const { data: resultItems, error: resultsError } = await supabase
      .from('result_items')
      .select('id, machine_import_id, lab_order_item_id, analyte_name, result_value, unit, reference_range, result_flag')
      .in(
        'lab_order_item_id',
        labOrderItemIds.length > 0 ? labOrderItemIds : ['00000000-0000-0000-0000-000000000000']
      );

    if (resultsError) {
      throw new Error(resultsError.message);
    }

    const { data: machineImports, error: importsError } = await supabase
      .from('machine_imports')
      .select('*')
      .eq('visit_id', visit.id)
      .order('created_at', { ascending: false });

    if (importsError) {
      throw new Error(importsError.message);
    }

    const itemsById = new Map((labOrderItems ?? []).map((item) => [item.id, item]));
    const importsById = new Map((machineImports ?? []).map((item) => [item.id, item]));
    const enrichedResults = (resultItems ?? []).map((item) => ({
      ...item,
      service_lane: itemsById.get(item.lab_order_item_id)?.service_lane ?? '',
      test_name: itemsById.get(item.lab_order_item_id)?.test_name ?? '',
      import_test_name: String(
        (importsById.get(item.machine_import_id)?.parsed_payload as { testName?: string } | null)
          ?.testName ?? ''
      ),
    }));

    const xrayImport = (machineImports ?? []).find((item) => item.lane === 'xray');
    const xrayResults = enrichedResults.filter((item) => item.service_lane === 'xray');

    const reportData: LabReportTemplateData = {
      reportTitle: 'Laboratory Result Report',
      patient: {
        name: [patient.last_name, patient.first_name, patient.middle_name].filter(Boolean).join(', ').replace(', ,', ','),
        patientNumber: patient.patient_code,
        company: patient.company ?? 'N/A',
        age: calculateAge(patient.birth_date),
        sex: prettifySex(patient.gender),
        birthDate: formatDate(patient.birth_date),
        address: [patient.street_address, patient.city, patient.province].filter(Boolean).join(', '),
        date: formatDate(queueEntry.created_at),
      },
      sections: buildSections(enrichedResults),
      xray:
        xrayImport || xrayResults.length > 0
          ? {
              title: 'Roentgenological Report',
              body:
                xrayResults.length > 0
                  ? [
                      String(
                        (xrayImport?.parsed_payload as { testName?: string } | null)?.testName ??
                          'Chest Xray'
                      ).toUpperCase(),
                      ...xrayResults.map(
                        (item) => `${item.analyte_name}: ${item.result_value}${item.unit ? ` ${item.unit}` : ''}`
                      ),
                    ]
                  : [String((xrayImport?.parsed_payload as { testName?: string } | null)?.testName ?? 'Chest Xray')],
              impression:
                (xrayImport?.parsed_payload as { impression?: string } | null)?.impression ??
                undefined,
            }
          : undefined,
      medicalExam: undefined,
      signatures: [
        {
          name: '[MEDICAL TECHNOLOGIST NAME]',
          role: '[MEDICAL TECHNOLOGIST ROLE]',
          license: '[LICENSE NUMBER]',
        },
        {
          name: '[PATHOLOGIST NAME]',
          role: '[PATHOLOGIST ROLE]',
          license: '[LICENSE NUMBER]',
        },
      ],
    };

    return NextResponse.json({
      reportData,
      meta: {
        queueId: queueEntry.id,
        queueNumber: queueEntry.queue_number,
        visitId: visit.id,
        orderCount: labOrders?.length ?? 0,
        resultCount: resultItems?.length ?? 0,
        machineImportCount: machineImports?.length ?? 0,
        lanes: Array.from(new Set((labOrderItems ?? []).map((item) => mapLaneToUiLane(String(item.service_lane))))),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load report data.' },
      { status: 500 }
    );
  }
}
