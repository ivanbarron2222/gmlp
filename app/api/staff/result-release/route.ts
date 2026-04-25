import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit-events';
import { recordNotificationEvent } from '@/lib/notification-events';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { assertActionPermission, requireStaffContext } from '@/lib/supabase/admin-auth';
import type { LabReportTemplateData, LabReportSection } from '@/components/common/lab-report-template';
import { generateLabReportPdf } from '@/lib/report-pdf';

type UiLane = 'BLOOD TEST' | 'DRUG TEST' | 'XRAY';
type ReportStatus = 'draft' | 'validated' | 'released';
type ReportRow = {
  id: string;
  lab_order_id: string;
  status: ReportStatus;
  pdf_storage_path?: string | null;
  email_sent_at?: string | null;
  validated_by: string | null;
  released_by: string | null;
  review_notes: string | null;
  review_flagged_at: string | null;
  validated_at: string | null;
  released_at: string | null;
};
type MachineImportStatus = 'uploaded' | 'parsed' | 'reviewed' | 'accepted' | 'rejected';
type AuditEvent = {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  actor: string;
  tone: 'default' | 'warning' | 'success';
};

type ReportRevisionRow = {
  id: string;
  report_id: string;
  revision_number: number;
  status: ReportStatus;
  action: string;
  review_notes: string | null;
  changed_by: string | null;
  created_at: string;
};

function createReportId() {
  return crypto.randomUUID();
}

async function recordReportRevisions(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  reports: Array<{
    id: string;
    status: ReportStatus;
    review_notes?: string | null;
    pdf_storage_path?: string | null;
    validated_at?: string | null;
    released_at?: string | null;
  }>,
  action: 'validate' | 'release' | 'flag_review',
  staffId: string | null
) {
  const reportIds = reports.map((report) => report.id);
  const { data: existingRows, error: existingError } = await supabase
    .from('report_revisions')
    .select('report_id, revision_number')
    .in('report_id', reportIds);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const lastRevisionByReportId = new Map<string, number>();
  for (const row of existingRows ?? []) {
    const reportId = String(row.report_id ?? '');
    const revisionNumber = Number(row.revision_number ?? 0);
    if (!reportId) {
      continue;
    }

    lastRevisionByReportId.set(reportId, Math.max(lastRevisionByReportId.get(reportId) ?? 0, revisionNumber));
  }

  const nextRows = reports.map((report) => ({
    report_id: report.id,
    revision_number: (lastRevisionByReportId.get(report.id) ?? 0) + 1,
    status: report.status,
    action,
    review_notes: report.review_notes ?? null,
    pdf_storage_path: report.pdf_storage_path ?? null,
    changed_by: staffId,
    snapshot: {
      validatedAt: report.validated_at ?? null,
      releasedAt: report.released_at ?? null,
    },
  }));

  const { error } = await supabase.from('report_revisions').insert(nextRows);
  if (error) {
    throw new Error(error.message);
  }
}

async function ensureReportsBucket(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  if (bucketsError) {
    throw new Error(bucketsError.message);
  }

  if (buckets?.some((bucket) => bucket.name === 'reports')) {
    return;
  }

  const { error: createBucketError } = await supabase.storage.createBucket('reports', {
    public: false,
  });

  if (createBucketError && !createBucketError.message.toLowerCase().includes('already exists')) {
    throw new Error(createBucketError.message);
  }
}

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

function getOverallReportStatus(
  reports: ReportRow[],
  hasResultData: boolean,
  hasReviewFlag = false
): ReportStatus | 'pending' {
  if (hasReviewFlag) {
    return 'draft';
  }

  if (reports.length === 0) {
    return hasResultData ? 'draft' : 'pending';
  }

  if (reports.every((report) => report.status === 'released')) {
    return 'released';
  }

  if (reports.some((report) => report.status === 'validated' || report.status === 'released')) {
    return 'validated';
  }

  return 'draft';
}

function toActorName(actorId: string | null | undefined, staffById: Map<string, string>) {
  if (!actorId) {
    return 'System';
  }

  return staffById.get(actorId) ?? 'Staff';
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
    const isPublicRequest = url.searchParams.get('public') === '1';

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

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, lab_order_id, status, pdf_storage_path, email_sent_at, validated_by, released_by, review_notes, review_flagged_at, validated_at, released_at')
      .in('lab_order_id', labOrderIds.length > 0 ? labOrderIds : ['00000000-0000-0000-0000-000000000000']);

    if (reportsError) {
      throw new Error(reportsError.message);
    }

    const reportIds = ((reports ?? []) as ReportRow[]).map((report) => report.id);
    const { data: reportRevisions, error: reportRevisionsError } = await supabase
      .from('report_revisions')
      .select('id, report_id, revision_number, status, action, review_notes, changed_by, created_at')
      .in('report_id', reportIds.length > 0 ? reportIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false });

    if (reportRevisionsError) {
      throw new Error(reportRevisionsError.message);
    }

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
    const actorIds = Array.from(
      new Set(
        [
          ...((machineImports ?? []) as Array<Record<string, unknown>>).flatMap((item) => [
            String(item.imported_by ?? ''),
            String(item.reviewed_by ?? ''),
          ]),
          ...((reports ?? []) as ReportRow[]).flatMap((report) => [
            report.validated_by ?? '',
            report.released_by ?? '',
          ]),
          ...((reportRevisions ?? []) as ReportRevisionRow[]).map((revision) => revision.changed_by ?? ''),
        ].filter(Boolean)
      )
    );
    const { data: staffProfiles, error: staffProfilesError } = await supabase
      .from('staff_profiles')
      .select('id, full_name')
      .in('id', actorIds.length > 0 ? actorIds : ['00000000-0000-0000-0000-000000000000']);

    if (staffProfilesError) {
      throw new Error(staffProfilesError.message);
    }

    const staffById = new Map((staffProfiles ?? []).map((profile) => [String(profile.id), String(profile.full_name ?? 'Staff')]));
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
    const xrayParsed = ((xrayImport?.parsed_payload as {
      testName?: string;
      examType?: string;
      findings?: string[];
      impression?: string;
      remarks?: string;
    } | null) ?? null);
    const xrayNarrativeLines = Array.isArray(xrayParsed?.findings)
      ? xrayParsed.findings.map((line) => String(line).trim()).filter(Boolean)
      : [];
    const hasReviewFlag = ((machineImports ?? []) as Array<Record<string, unknown>>).some(
      (item) => String(item.import_status ?? '') === 'rejected'
    );
    const reportStatus = getOverallReportStatus(
      (reports ?? []) as ReportRow[],
      enrichedResults.length > 0,
      hasReviewFlag
    );

    const auditLog: AuditEvent[] = [
      ...((machineImports ?? []) as Array<Record<string, unknown>>).flatMap((item) => {
        const payload = (item.parsed_payload as { testName?: string } | null) ?? null;
        const testName = payload?.testName ?? 'Machine import';
        const importStatus = String(item.import_status ?? '') as MachineImportStatus;
        const events: AuditEvent[] = [
          {
            id: `import-${String(item.id)}-created`,
            timestamp: String(item.created_at),
            title: 'Machine result uploaded',
            detail: `${testName} import saved as ${importStatus}.`,
            actor: toActorName(String(item.imported_by ?? ''), staffById),
            tone: importStatus === 'rejected' ? 'warning' : 'default',
          },
        ];

        if (item.reviewed_at) {
          events.push({
            id: `import-${String(item.id)}-reviewed`,
            timestamp: String(item.reviewed_at),
            title: importStatus === 'rejected' ? 'Flagged for review' : 'Machine import reviewed',
            detail:
              importStatus === 'rejected'
                ? `${testName} was flagged for review and blocked from release.`
                : `${testName} review status updated to ${importStatus}.`,
            actor: toActorName(String(item.reviewed_by ?? ''), staffById),
            tone: importStatus === 'rejected' ? 'warning' : 'default',
          });
        }

        return events;
      }),
      ...((reports ?? []) as ReportRow[]).flatMap((report) => {
        const events: AuditEvent[] = [];

        if (report.validated_at) {
          events.push({
            id: `report-${report.id}-validated`,
            timestamp: report.validated_at,
            title: 'Report validated',
            detail: 'Laboratory report was validated for release.',
            actor: toActorName(report.validated_by, staffById),
            tone: 'default',
          });
        }

        if (report.released_at) {
          events.push({
            id: `report-${report.id}-released`,
            timestamp: report.released_at,
            title: 'Report released',
            detail: 'Released report is now available for soft-copy access.',
            actor: toActorName(report.released_by, staffById),
            tone: 'success',
          });
        }

        if (report.review_flagged_at) {
          events.push({
            id: `report-${report.id}-review-flagged`,
            timestamp: report.review_flagged_at,
            title: 'Report flagged for review',
            detail: report.review_notes?.trim() || 'Review remarks were not provided.',
            actor: toActorName(report.validated_by, staffById),
            tone: 'warning',
          });
        }

        return events;
      }),
      ...((reportRevisions ?? []) as ReportRevisionRow[]).map((revision) => ({
        id: revision.id,
        timestamp: revision.created_at,
        title: `Report revision #${revision.revision_number}`,
        detail: revision.review_notes?.trim() || `Revision saved after ${revision.action}.`,
        actor: toActorName(revision.changed_by, staffById),
        tone: (
          revision.status === 'released'
            ? 'success'
            : revision.action === 'flag_review'
              ? 'warning'
              : 'default'
        ) as AuditEvent['tone'],
      })),
    ].sort((left, right) => right.timestamp.localeCompare(left.timestamp));

    if (isPublicRequest && reportStatus !== 'released') {
      return NextResponse.json({ error: 'This report has not been released yet.' }, { status: 403 });
    }

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
                xrayNarrativeLines.length > 0
                  ? [
                      String(xrayParsed?.examType ?? xrayParsed?.testName ?? 'Chest Xray'),
                      ...xrayNarrativeLines,
                    ]
                  : xrayResults.length > 0
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
                xrayParsed?.impression ??
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
      xraySignature: {
        name: '[RADIOLOGIST NAME]',
        role: '[RADIOLOGIST ROLE]',
        license: '[LICENSE NUMBER]',
      },
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
        pdfStoragePath:
          ((reports ?? []) as Array<ReportRow>)
            .map((report) => report.pdf_storage_path)
            .find((value) => Boolean(value)) ?? '',
        emailAddress: patient.email_address ?? '',
        emailSentAt:
          ((reports ?? []) as Array<ReportRow>)
            .map((report) => report.email_sent_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        hasReviewFlag,
        reviewNotes:
          ((reports ?? []) as ReportRow[])
            .map((report) => report.review_notes)
            .find((value) => Boolean(value?.trim())) ?? '',
        reportStatus,
        validatedAt:
          ((reports ?? []) as ReportRow[])
            .map((report) => report.validated_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        releasedAt:
          ((reports ?? []) as ReportRow[])
            .map((report) => report.released_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        lanes: Array.from(new Set((labOrderItems ?? []).map((item) => mapLaneToUiLane(String(item.service_lane))))),
        auditLog,
        revisions: (reportRevisions ?? []) as ReportRevisionRow[],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load report data.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    const body = (await request.json()) as {
      queueId?: string;
      action?: 'validate' | 'release' | 'flag_review';
      staffId?: string;
      reviewNotes?: string;
    };

    if (!body.queueId || !body.action) {
      return NextResponse.json({ error: 'Missing release payload.' }, { status: 400 });
    }

    if (body.action === 'validate') {
      assertActionPermission(context, 'validate_report');
    } else if (body.action === 'release') {
      assertActionPermission(context, 'release_report');
    } else {
      assertActionPermission(context, 'flag_report_review');
    }

    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const requestUrl = new URL(request.url);
    const actorStaffId = context.userId;

    const { data: queueEntry, error: queueError } = await supabase
      .from('queue_entries')
      .select('id, visit_id, patient_id')
      .eq('id', body.queueId)
      .single();

    if (queueError || !queueEntry) {
      throw new Error(queueError?.message ?? 'Queue entry not found.');
    }

    const { data: labOrders, error: labOrdersError } = await supabase
      .from('lab_orders')
      .select('id, status, validated_at, released_at')
      .eq('visit_id', queueEntry.visit_id);

    if (labOrdersError) {
      throw new Error(labOrdersError.message);
    }

    if (!labOrders || labOrders.length === 0) {
      return NextResponse.json({ error: 'No lab orders found for this visit.' }, { status: 400 });
    }

    const labOrderIds = labOrders.map((order) => order.id);

    const { data: machineImports, error: importsError } = await supabase
      .from('machine_imports')
      .select('id, import_status')
      .eq('visit_id', queueEntry.visit_id);

    if (importsError) {
      throw new Error(importsError.message);
    }

    if ((machineImports?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: 'At least one machine import is required before validation or release.' },
        { status: 400 }
      );
    }

    if (body.action === 'flag_review') {
      const { error: reviewImportError } = await supabase
        .from('machine_imports')
        .update({
          import_status: 'rejected',
          reviewed_by: actorStaffId,
          reviewed_at: now,
        })
        .eq('visit_id', queueEntry.visit_id);

      if (reviewImportError) {
        throw new Error(reviewImportError.message);
      }

      const { error: resetReportsError } = await supabase
        .from('reports')
        .update({
          status: 'draft',
          review_notes: body.reviewNotes?.trim() || null,
          review_flagged_at: now,
          released_by: null,
          released_at: null,
          validated_by: actorStaffId,
        })
        .in('lab_order_id', labOrderIds);

      if (resetReportsError) {
        throw new Error(resetReportsError.message);
      }

      const { data: flaggedReports, error: flaggedReportsError } = await supabase
        .from('reports')
        .select('id, status, review_notes, pdf_storage_path, validated_at, released_at')
        .in('lab_order_id', labOrderIds);

      if (flaggedReportsError) {
        throw new Error(flaggedReportsError.message);
      }

      await recordReportRevisions(
        supabase,
        (flaggedReports ?? []) as Array<{
          id: string;
          status: ReportStatus;
          review_notes?: string | null;
          pdf_storage_path?: string | null;
          validated_at?: string | null;
          released_at?: string | null;
        }>,
        'flag_review',
        actorStaffId
      );

      await recordAuditEvent({
        eventType: 'report_flagged_for_review',
        entityType: 'visit',
        entityId: String(queueEntry.visit_id),
        visitId: String(queueEntry.visit_id),
        patientId: String(queueEntry.patient_id),
        queueEntryId: String(queueEntry.id),
        actorStaffId,
        summary: 'Report flagged for review.',
        detail: body.reviewNotes?.trim() || null,
      });

      return NextResponse.json({
        success: true,
        reportStatus: 'draft',
      });
    }

    if ((machineImports ?? []).some((item) => item.import_status === 'rejected')) {
      return NextResponse.json(
        { error: 'This visit is flagged for review. Resolve the review issue before validation or release.' },
        { status: 400 }
      );
    }

    const { data: existingReports, error: existingReportsError } = await supabase
      .from('reports')
      .select('id, lab_order_id, status, review_notes, review_flagged_at, validated_at, released_at')
      .in('lab_order_id', labOrderIds);

    if (existingReportsError) {
      throw new Error(existingReportsError.message);
    }

    const reportByOrderId = new Map(
      ((existingReports ?? []) as ReportRow[]).map((report) => [report.lab_order_id, report])
    );

    const nextReports = labOrders.map((order) => {
      const existingReport = reportByOrderId.get(order.id);
      const isRelease = body.action === 'release';
      const nextStatus: ReportStatus =
        existingReport?.status === 'released'
          ? 'released'
          : isRelease
            ? 'released'
            : 'validated';

      return {
        id: existingReport?.id ?? createReportId(),
        lab_order_id: order.id,
        visit_id: queueEntry.visit_id,
        patient_id: queueEntry.patient_id,
        status: nextStatus,
        validated_by: actorStaffId,
        review_notes: null,
        review_flagged_at: null,
        validated_at: existingReport?.validated_at ?? now,
        released_by:
          nextStatus === 'released'
            ? actorStaffId
            : null,
        released_at: nextStatus === 'released' ? existingReport?.released_at ?? now : null,
      };
    });

    const { error: upsertReportsError } = await supabase
      .from('reports')
      .upsert(nextReports, { onConflict: 'lab_order_id' });

    if (upsertReportsError) {
      throw new Error(upsertReportsError.message);
    }

    const { error: acceptImportsError } = await supabase
      .from('machine_imports')
      .update({
        import_status: 'accepted',
        reviewed_by: actorStaffId,
        reviewed_at: now,
      })
      .eq('visit_id', queueEntry.visit_id);

    if (acceptImportsError) {
      throw new Error(acceptImportsError.message);
    }

    if (body.action === 'release') {
      const { error: releaseOrdersError } = await supabase
        .from('lab_orders')
        .update({
          status: 'released',
          released_by: actorStaffId,
          released_at: now,
          validated_by: actorStaffId,
          validated_at: now,
        })
        .in('id', labOrderIds);

      if (releaseOrdersError) {
        throw new Error(releaseOrdersError.message);
      }

      const reportResponse = await fetch(
        `${requestUrl.origin}/api/staff/result-release?queueId=${encodeURIComponent(body.queueId)}`,
        {
          cache: 'no-store',
          headers: {
            cookie: request.headers.get('cookie') ?? '',
          },
        }
      );

      if (!reportResponse.ok) {
        const payload = (await reportResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Unable to rebuild report PDF.');
      }

      const payload = (await reportResponse.json()) as {
        reportData: LabReportTemplateData;
      };
      const pdfBytes = await generateLabReportPdf({
        ...payload.reportData,
        softCopyQrDataUrl: '',
      });

      await ensureReportsBucket(supabase);

      const pdfStoragePath = `released/${body.queueId}/report-${now.replace(/[:.]/g, '-')}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(pdfStoragePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { error: updateReportsPathError } = await supabase
        .from('reports')
        .update({
          pdf_storage_path: pdfStoragePath,
        })
        .in('lab_order_id', labOrderIds);

      if (updateReportsPathError) {
        throw new Error(updateReportsPathError.message);
      }
    } else {
      const { error: validateOrdersError } = await supabase
        .from('lab_orders')
        .update({
          validated_by: actorStaffId,
          validated_at: now,
        })
        .in('id', labOrderIds);

      if (validateOrdersError) {
        throw new Error(validateOrdersError.message);
      }
    }

    const revisionReports = nextReports.map((report) => ({
      id: report.id,
      status: report.status,
      review_notes: report.review_notes,
      pdf_storage_path: null,
      validated_at: report.validated_at,
      released_at: report.released_at,
    }));
    await recordReportRevisions(supabase, revisionReports, body.action, actorStaffId);

    await recordAuditEvent({
      eventType: body.action === 'release' ? 'report_released' : 'report_validated',
      entityType: 'visit',
      entityId: String(queueEntry.visit_id),
      visitId: String(queueEntry.visit_id),
      patientId: String(queueEntry.patient_id),
      queueEntryId: String(queueEntry.id),
      actorStaffId,
      summary: body.action === 'release' ? 'Released patient report.' : 'Validated patient report.',
    });

    if (body.action === 'release') {
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('email_address')
        .eq('id', queueEntry.patient_id)
        .maybeSingle();

      if (patientError) {
        throw new Error(patientError.message);
      }

      if (patient?.email_address) {
        const { data: firstReport } = await supabase
          .from('reports')
          .select('id')
          .in('lab_order_id', labOrderIds)
          .limit(1)
          .maybeSingle();

        await recordNotificationEvent({
          eventType: 'report_release',
          channel: 'email',
          recipient: String(patient.email_address),
          patientId: String(queueEntry.patient_id),
          visitId: String(queueEntry.visit_id),
          reportId: String(firstReport?.id ?? ''),
          subject: 'Your Globalife report is ready',
          payload: { queueId: body.queueId },
          status: 'pending',
        });
      }
    }

    return NextResponse.json({
      success: true,
      reportStatus: body.action === 'release' ? 'released' : 'validated',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update report status.' },
      { status: 500 }
    );
  }
}
