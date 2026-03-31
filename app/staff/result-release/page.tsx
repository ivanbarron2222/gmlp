'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Download, Eye, EyeOff, Mail, ZoomIn, ZoomOut } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import { getPublicAppUrl } from '@/lib/app-url';
import { StatusBadge } from '@/components/common/status-badge';
import {
  LabReportTemplate,
  type LabReportTemplateData,
} from '@/components/common/lab-report-template';

const reportTemplateData: LabReportTemplateData = {
  reportTitle: 'Laboratory Result Report',
  softCopyQrDataUrl: '',
  patient: {
    name: '[PATIENT NAME]',
    patientNumber: '[PATIENT NUMBER]',
    company: '[COMPANY / EMPLOYER]',
    age: '[AGE]',
    sex: '[SEX]',
    birthDate: '[BIRTH DATE]',
    address: '[PATIENT ADDRESS]',
    date: '[REPORT DATE]',
  },
  sections: [
    {
      title: 'Hematology',
      rows: [
        { test: 'Hemoglobin', normalValues: 'M:140-180 F:120-160', result: '149' },
        { test: 'Hematocrit', normalValues: 'M:0.40-0.54 F:0.37-0.47', result: '0.47' },
        { test: 'WBC', normalValues: '5-10 x 10^9/L', result: '9.70' },
        { test: 'RBC', normalValues: 'M:4.6-6.2 F:4.0-5.4', result: '5.21' },
        { test: 'Neutrophils', normalValues: '40-75', result: '75' },
        { test: 'Lymphocytes', normalValues: '20-45', result: '18', flag: 'abnormal' },
        { test: 'Eosinophils', normalValues: '1-5', result: '3' },
        { test: 'Monocytes', normalValues: '1-7', result: '4' },
        { test: 'Platelet Count', normalValues: '150-450 x 10^9/L', result: '338' },
      ],
    },
    {
      title: 'Urinalysis',
      rows: [
        { test: 'Color', normalValues: 'Yellow', result: 'Yellow' },
        { test: 'Turbidity', normalValues: 'Clear', result: 'Clear' },
        { test: 'Specific Gravity', normalValues: 'Variable', result: '1.020' },
        { test: 'Reaction', normalValues: 'Usually acidic', result: 'Acidic' },
        { test: 'Sugar', normalValues: 'Negative', result: 'Negative' },
        { test: 'Protein', normalValues: 'Negative', result: 'Negative' },
        { test: 'RBC', normalValues: '0-2 /hpf', result: '0-2' },
        { test: 'WBC', normalValues: '0-4 /hpf', result: '0-2' },
        { test: 'Bacteria', normalValues: 'Rare', result: 'Rare' },
      ],
    },
    {
      title: 'Fecalysis',
      rows: [],
    },
    {
      title: 'Others',
      rows: [
        { test: 'Drug Test', normalValues: 'Negative', result: 'Negative' },
        { test: 'HBsAg Screening', normalValues: 'Non-reactive', result: 'Non-reactive' },
      ],
    },
  ],
  xray: {
    title: 'Roentgenological Report',
    body: [
      'CHEST PA',
      'No definite focal infiltrates.',
      'Heart is not enlarged.',
      'Aorta is unremarkable.',
      'The pulmonary vascularity is within normal.',
      'Diaphragm and costophrenic sulci are intact.',
    ],
    impression: 'Normal chest findings',
  },
  medicalExam: {
    diagnosis: ['[1] T/C Hypertension', '[2] Overweight'],
    recommendation: [
      '[1] Daily BP monitoring. Low salt and fat diet. Suggest hypertensive work up.',
      '[2] Increase aerobic exercise. Avoid processed food. Increase nutrient-rich food with portion control.',
    ],
  },
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

function ResultReleasePageContent() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get('queueId');
  const reportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [showDetails, setShowDetails] = useState(true);
  const [reportData, setReportData] = useState<LabReportTemplateData>(reportTemplateData);
  const [reportMeta, setReportMeta] = useState<{
    queueNumber?: string;
    resultCount?: number;
    machineImportCount?: number;
    lanes?: string[];
  } | null>(null);
  const [softCopyQrDataUrl, setSoftCopyQrDataUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [releaseItems, setReleaseItems] = useState<
    Array<{
      queueId: string;
      queueNumber: string;
      patientName: string;
      company: string;
      date: string;
      orderCount: number;
      machineImportCount: number;
      pendingLaneCount: number;
      ready: boolean;
    }>
  >([]);
  const [isLoadingReleaseList, setIsLoadingReleaseList] = useState(false);

  useEffect(() => {
    setIsLoadingReleaseList(true);
    fetch('/api/staff/result-release-list', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Unable to load release list.');
        }

        return (await response.json()) as {
          releaseItems: Array<{
            queueId: string;
            queueNumber: string;
            patientName: string;
            company: string;
            date: string;
            orderCount: number;
            machineImportCount: number;
            pendingLaneCount: number;
            ready: boolean;
          }>;
        };
      })
      .then((payload) => setReleaseItems(payload.releaseItems))
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load release list.');
        setReleaseItems([]);
      })
      .finally(() => setIsLoadingReleaseList(false));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !queueId) {
      setSoftCopyQrDataUrl('');
      return;
    }

    const appUrl = getPublicAppUrl();

    if (!appUrl) {
      setSoftCopyQrDataUrl('');
      return;
    }

    const softCopyUrl = `${appUrl}/report/${encodeURIComponent(queueId)}`;

    QRCode.toDataURL(softCopyUrl, {
      width: 160,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setSoftCopyQrDataUrl(url))
      .catch(() => setSoftCopyQrDataUrl(''));
  }, [queueId]);

  useEffect(() => {
    if (!queueId) {
      setReportData({
        ...reportTemplateData,
        softCopyQrDataUrl,
      });
      setReportMeta(null);
      return;
    }

    setIsLoading(true);
    setLoadError('');

    fetch(`/api/staff/result-release?queueId=${encodeURIComponent(queueId)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Unable to load report data.');
        }

        return (await response.json()) as {
          reportData: LabReportTemplateData;
          meta: {
            queueNumber?: string;
            resultCount?: number;
            machineImportCount?: number;
            lanes?: string[];
          };
        };
      })
      .then((payload) => {
        setReportData({
          ...payload.reportData,
          softCopyQrDataUrl,
        });
        setReportMeta(payload.meta);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load report data.');
        setReportData({
          ...reportTemplateData,
          softCopyQrDataUrl,
        });
        setReportMeta(null);
      })
      .finally(() => setIsLoading(false));
  }, [queueId, softCopyQrDataUrl]);

  const handlePrintReport = () => {
    if (typeof window === 'undefined' || !reportRef.current) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=900');

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportTemplateData.reportTitle}</title>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              padding: 10mm 8mm;
              background: #f4f7f5;
              font-family: "Times New Roman", Times, serif;
              color: #0f172a;
            }
            * { box-sizing: border-box; }
            table { border-collapse: collapse; width: 100%; }
            th, td { vertical-align: top; }
            .report-sheet { max-width: 850px; margin: 0 auto; }
            .lab-report {
              width: 100%;
              max-width: 794px;
              margin: 0 auto;
              background: #ffffff;
              color: #0f172a;
              font-family: "Times New Roman", Times, serif;
            }
            .lab-report__sheet {
              position: relative;
              overflow: hidden;
              border: 1px solid #cfd8cf;
              background: #ffffff;
            }
            .lab-report__watermark {
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              opacity: 0.045;
            }
            .lab-report__watermark-ring {
              width: 470px;
              height: 470px;
              border-radius: 9999px;
              border: 22px solid #0b65b1;
            }
            .lab-report__content {
              position: relative;
              padding: 20px 28px 24px;
            }
            .lab-report__header {
              border-bottom: 2px solid #0b65b1;
              padding-bottom: 12px;
              text-align: center;
            }
            .lab-report__header-row {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 16px;
            }
            .lab-report__logo {
              margin-top: 2px;
              width: 64px;
              height: 64px;
              border: 3px solid #0b65b1;
              border-radius: 9999px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #0b65b1;
              font-size: 9px;
              font-weight: 900;
              line-height: 1.2;
            }
            .lab-report__header-main {
              flex: 1;
            }
            .lab-report__eyebrow {
              margin: 0;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.28em;
              color: #0b65b1;
            }
            .lab-report__title {
              margin: 4px 0 0;
              font-size: 28px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: -0.02em;
              color: #0b65b1;
            }
            .lab-report__tagline {
              margin: 4px 0 0;
              font-size: 15px;
              font-style: italic;
              color: #0b65b1;
            }
            .lab-report__contact {
              margin: 8px 0 0;
              font-size: 10px;
              line-height: 1.3;
              color: #475569;
            }
            .lab-report__qr {
              width: 76px;
              flex-shrink: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .lab-report__qr img,
            .lab-report__qr-placeholder {
              width: 68px;
              height: 68px;
              border: 1px solid #cbd5e1;
              background: #ffffff;
              padding: 4px;
            }
            .lab-report__qr-label {
              margin-top: 4px;
              font-size: 8px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.16em;
              color: #64748b;
              text-align: center;
            }
            .lab-report__patient-section,
            .lab-report__panel,
            .lab-report__narrative,
            .lab-report__medical {
              border: 1px solid #334155;
            }
            .lab-report__patient-section {
              margin-top: 12px;
            }
            .lab-report__patient-row {
              display: grid;
            }
            .lab-report__patient-row + .lab-report__patient-row {
              border-top: 1px solid #94a3b8;
            }
            .lab-report__patient-row--split,
            .lab-report__patient-row:first-child,
            .lab-report__patient-row:nth-child(2) {
              grid-template-columns: 1.4fr 1fr;
            }
            .lab-report__patient-row:last-child {
              grid-template-columns: repeat(4, minmax(0, 1fr));
            }
            .lab-report__patient-cell-grid {
              display: grid;
            }
            .lab-report__label {
              border-right: 1px solid #94a3b8;
              padding: 2px 8px;
              font-size: 11px;
              font-weight: 700;
            }
            .lab-report__value {
              padding: 2px 8px;
              font-size: 11px;
            }
            .lab-report__section-grid {
              margin-top: 14px;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 0;
              border: 1px solid #334155;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .lab-report__panel-title {
              border-bottom: 1px solid #334155;
              padding: 4px 16px;
              text-align: center;
              font-size: 15px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.01em;
            }
            .lab-report__th,
            .lab-report__td,
            .lab-report__empty {
              padding: 2px 6px;
              font-size: 12px;
            }
            .lab-report__th {
              text-align: left;
              font-weight: 700;
            }
            .lab-report__tr {
              vertical-align: top;
            }
            .lab-report__panel {
              min-height: 230px;
            }
            .lab-report__footer {
              margin-top: 24px;
              padding-top: 20px;
              font-size: 12px;
            }
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            .lab-report__narrative,
            .lab-report__medical {
              margin-top: 24px;
              padding: 20px;
            }
            .lab-report__narrative-title {
              margin: 0;
              text-align: center;
              font-size: 28px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .lab-report__narrative-body {
              margin-top: 20px;
              font-size: 15px;
              line-height: 1.9;
            }
            .lab-report__impression {
              margin-top: 24px;
            }
            .lab-report__impression-label {
              margin: 0;
              font-size: 20px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .lab-report__impression-text {
              margin: 8px 0 0;
              font-size: 18px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .lab-report__medical-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 24px;
            }
            .lab-report__medical-title {
              margin: 0;
              font-size: 18px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .lab-report__medical-list {
              margin: 12px 0 0;
              padding-left: 0;
              list-style: none;
              font-size: 14px;
              line-height: 1.7;
            }
            .lab-report__medical-list li + li {
              margin-top: 8px;
            }
            .lab-report__footer {
              margin-top: 40px;
              padding-top: 32px;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 40px;
              text-align: center;
              font-size: 14px;
            }
            .lab-report__signature {
              max-width: 280px;
              margin: 0 auto;
              padding-top: 12px;
              border-top: 1px solid #475569;
            }
            .lab-report__signature-name {
              margin: 0;
              font-weight: 700;
              text-transform: uppercase;
            }
            .lab-report__signature-role,
            .lab-report__signature-license {
              margin: 2px 0 0;
            }
            .text-red-700 { color: #b91c1c; }
            .text-slate-900 { color: #0f172a; }
            .font-semibold { font-weight: 600; }
            .font-medium { font-weight: 500; }
            @page { size: A4; margin: 10mm; }
            @media print {
              body {
                padding: 0;
                background: #ffffff;
              }
              .report-sheet {
                max-width: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="report-sheet">${reportRef.current.innerHTML}</div>
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
              Result Release
            </p>
            <h1 className="mt-2 text-3xl font-bold">PDF Report Template</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              This template is based on your reference sheets and now reads queue-linked report
              data from Supabase when a valid `queueId` is provided.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Eye className="mr-2 h-4 w-4" />
              Audit Log
            </Button>
            <Button variant="destructive" size="sm">
              Flag for Review
            </Button>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">Release Queue</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Keep the queue visible while you review and release each report.
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {releaseItems.length} queued
                </span>
              </div>

              <div className="mt-4 h-[60vh] min-h-[340px] space-y-3 overflow-y-auto pr-2">
                {isLoadingReleaseList ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                    Loading release queue...
                  </div>
                ) : releaseItems.length > 0 ? (
                  releaseItems.map((item) => {
                    const isActive = item.queueId === queueId;

                    return (
                      <Link
                        key={item.queueId}
                        href={`/staff/result-release?queueId=${encodeURIComponent(item.queueId)}`}
                        className={`block rounded-2xl border p-4 transition-all ${
                          isActive
                            ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                            : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold leading-snug">
                              {item.queueNumber} • {item.patientName}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.company || 'No company'} • {item.date}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {item.machineImportCount} imports • {item.orderCount} orders •{' '}
                              {item.pendingLaneCount} pending lanes
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                item.ready
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {item.ready ? 'Ready' : 'Pending'}
                            </span>
                            {isActive && (
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                                Open
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    No release-ready visits found yet.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Patient Summary
              </p>
              <h2 className="mt-4 text-2xl font-bold">{reportData.patient.name}</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Patient Number
                  </p>
                  <p className="mt-1 font-medium">{reportData.patient.patientNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Company
                  </p>
                  <p className="mt-1 font-medium">{reportData.patient.company}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Date
                  </p>
                  <p className="mt-1 font-medium">{reportData.patient.date}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Document Status
              </p>
              <StatusBadge status={reportMeta?.resultCount ? 'released' : 'pending'} />
            </Card>

            <Card className="space-y-3 p-6">
              <Button className="w-full">Release Result</Button>
              <Button variant="outline" className="w-full" onClick={handlePrintReport}>
                <Download className="mr-2 h-4 w-4" />
                Save as PDF
              </Button>
              <Button variant="outline" className="w-full">
                <Mail className="mr-2 h-4 w-4" />
                Email Patient
              </Button>
            </Card>

            {queueId && (
              <Card className="p-6">
                <h3 className="text-lg font-bold">Live Report Context</h3>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p>
                    Queue Number:{' '}
                    <span className="font-medium text-foreground">
                      {reportMeta?.queueNumber || 'N/A'}
                    </span>
                  </p>
                  <p>
                    Result Rows:{' '}
                    <span className="font-medium text-foreground">
                      {reportMeta?.resultCount ?? 0}
                    </span>
                  </p>
                  <p>
                    Machine Imports:{' '}
                    <span className="font-medium text-foreground">
                      {reportMeta?.machineImportCount ?? 0}
                    </span>
                  </p>
                  <p>
                    Lanes:{' '}
                    <span className="font-medium text-foreground">
                      {reportMeta?.lanes?.join(', ') || 'N/A'}
                    </span>
                  </p>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((current) => Math.max(60, current - 10))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="min-w-12 text-center text-sm font-semibold">{zoom}%</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((current) => Math.min(160, current + 10))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              <Button variant="outline" size="sm" onClick={() => setShowDetails((current) => !current)}>
                {showDetails ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {showDetails ? 'Hide' : 'Show'} Side Details
              </Button>
            </Card>

            <div className="overflow-auto rounded-3xl border bg-[#edf3ee] p-6">
              {isLoading && (
                <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                  Loading live report data...
                </div>
              )}

              {loadError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loadError}
                </div>
              )}

              <div
                className="origin-top transition-transform"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                <div ref={reportRef}>
                  <LabReportTemplate data={{ ...reportData, softCopyQrDataUrl }} />
                </div>
              </div>
            </div>

            {showDetails && (
              <Card className="p-6">
                <h3 className="text-lg font-bold">Template Coverage</h3>
                <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                  <p>Includes patient demographics and company details.</p>
                  <p>Supports hematology, urinalysis, fecalysis, and other lab panels.</p>
                  <p>Includes x-ray narrative and impression block.</p>
                  <p>Includes medical diagnosis, recommendations, and signatories.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function ResultReleasePage() {
  return (
    <Suspense fallback={null}>
      <ResultReleasePageContent />
    </Suspense>
  );
}


