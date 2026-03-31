'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  LabReportTemplate,
  type LabReportTemplateData,
} from '@/components/common/lab-report-template';

const fallbackReportData: LabReportTemplateData = {
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
    { title: 'Hematology', rows: [] },
    { title: 'Urinalysis', rows: [] },
    { title: 'Fecalysis', rows: [] },
    { title: 'Others', rows: [] },
  ],
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

export default function PublicReportPage() {
  const params = useParams<{ queueId: string }>();
  const queueId = String(params?.queueId ?? '');
  const [reportData, setReportData] = useState<LabReportTemplateData>(fallbackReportData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState('');
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    if (!queueId) {
      setError('Missing report reference.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    setPdfDownloadUrl('');
    setPdfError('');

    fetch(`/api/staff/result-release?queueId=${encodeURIComponent(queueId)}&public=1`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Unable to load report.');
        }

        return (await response.json()) as { reportData: LabReportTemplateData };
      })
      .then((payload) => {
        setReportData({
          ...payload.reportData,
          softCopyQrDataUrl: '',
        });

        fetch(`/api/public/report-download?queueId=${encodeURIComponent(queueId)}`, {
          cache: 'no-store',
        })
          .then(async (response) => {
            if (!response.ok) {
              const downloadPayload = (await response.json().catch(() => null)) as
                | { error?: string }
                | null;
              throw new Error(downloadPayload?.error ?? 'Unable to prepare PDF download.');
            }

            return (await response.json()) as { downloadUrl: string };
          })
          .then((downloadPayload) => {
            setPdfDownloadUrl(downloadPayload.downloadUrl);
          })
          .catch((downloadError) => {
            setPdfError(
              downloadError instanceof Error
                ? downloadError.message
                : 'Unable to prepare PDF download.'
            );
          });
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load report.');
        setReportData(fallbackReportData);
      })
      .finally(() => setIsLoading(false));
  }, [queueId]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 md:px-6">
      <div className="mx-auto mb-4 flex max-w-[794px] flex-wrap justify-end gap-2">
        {pdfDownloadUrl && (
          <Button asChild type="button">
            <a href={pdfDownloadUrl} target="_blank" rel="noreferrer">
              Download Released PDF
            </a>
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>

      {error ? (
        <div className="mx-auto max-w-[794px] rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">
          {error}
        </div>
      ) : isLoading ? (
        <div className="mx-auto max-w-[794px] rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading report...
        </div>
      ) : (
        <>
          {pdfError && (
            <div className="mx-auto mb-4 max-w-[794px] rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-700">
              {pdfError}
            </div>
          )}
          <LabReportTemplate data={reportData} />
        </>
      )}
    </main>
  );
}
