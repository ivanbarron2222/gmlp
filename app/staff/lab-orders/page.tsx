'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Beaker, FileUp, QrCode, ScanLine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import { fetchQueueEntry, postQueueAction } from '@/lib/queue-api';
import { getQueueScanPath, QueueEntry, QueueLane } from '@/lib/queue-store';
import {
  findVisitByQueueEntryId,
  MachineResultImport,
  saveVisitMachineResult,
} from '@/lib/patient-records-store';
import { parseMachineResultText, type ParsedMachineResult } from '@/lib/machine-result-parser';

type LabLane = Extract<QueueLane, 'BLOOD TEST' | 'DRUG TEST' | 'XRAY'>;
type BloodTestCategory = 'hematology' | 'urinalysis';

const supportedLanes: LabLane[] = ['BLOOD TEST', 'DRUG TEST', 'XRAY'];

function readLaneParam(rawLane: string | null): LabLane {
  return supportedLanes.includes(rawLane as LabLane) ? (rawLane as LabLane) : 'BLOOD TEST';
}

function LabOrdersPageContent() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get('queueId');
  const lane = readLaneParam(searchParams.get('lane'));
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [parsedImport, setParsedImport] = useState<ParsedMachineResult | null>(null);
  const [rawImportText, setRawImportText] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [savedImportFromDb, setSavedImportFromDb] = useState<MachineResultImport | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [bloodTestCategory, setBloodTestCategory] = useState<BloodTestCategory>('hematology');

  useEffect(() => {
    if (!queueId) {
      setEntry(null);
      return;
    }

    let isMounted = true;
    fetchQueueEntry(queueId)
      .then((queueEntry) => {
        if (isMounted) {
          setEntry(queueEntry);
        }
      })
      .catch(() => {
        if (isMounted) {
          setEntry(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [queueId]);

  useEffect(() => {
    if (!queueId) {
      setSavedImportFromDb(null);
      return;
    }

    const controller = new AbortController();

    const query = new URLSearchParams({
      queueId,
      lane,
    });

    if (lane === 'BLOOD TEST') {
      query.set('bloodTestCategory', bloodTestCategory);
    }

    fetch(`/api/staff/lab-import?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Unable to load saved machine import.');
        }

        return (await response.json()) as { machineImport: MachineResultImport | null };
      })
      .then((payload) => setSavedImportFromDb(payload.machineImport))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setImportError(
            error instanceof Error ? error.message : 'Unable to load saved machine import.'
          );
        }
      });

    return () => controller.abort();
  }, [queueId, lane, bloodTestCategory]);

  const visitContext = useMemo(
    () => (queueId ? findVisitByQueueEntryId(queueId) : null),
    [queueId]
  );
  const savedMachineResult =
    savedImportFromDb ?? visitContext?.visit.machineResults?.find((item) => item.lane === lane) ?? null;

  const hasPendingStep = entry?.pendingLanes.includes(lane) ?? false;
  const isCurrentLane = entry?.currentLane === lane;
  const isServingHere = isCurrentLane && entry?.status === 'serving';
  const isCompletedHere = entry?.completedLanes.includes(lane) ?? false;

  const handleCompleteStep = async () => {
    if (!entry || !queueId) {
      return;
    }

    const nextQueue = await postQueueAction({ action: 'finish_step', queueId });
    setEntry(nextQueue.find((item) => item.id === queueId) ?? null);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = parseMachineResultText(text);
    setRawImportText(text);
    setParsedImport(parsed);
    setImportMessage('');
    setImportError('');
    setSelectedFileName(file.name);
    event.target.value = '';
  };

  const handleSaveImport = async () => {
    if (!entry || !parsedImport || !queueId) {
      return;
    }

    setIsSavingImport(true);
    setImportError('');
    setImportMessage('');

    try {
      const response = await fetch('/api/staff/lab-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queueId,
          lane,
          bloodTestCategory: lane === 'BLOOD TEST' ? bloodTestCategory : undefined,
          sourceFilename: selectedFileName || 'machine-result.txt',
          rawText: rawImportText,
          parsedImport,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Unable to save machine import.');
      }

      const payload = (await response.json()) as { machineImport: MachineResultImport };
      saveVisitMachineResult(queueId, payload.machineImport);
      setSavedImportFromDb(payload.machineImport);
      setImportMessage(`Machine result saved to database for ${entry.patientName}.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to save machine import.');
    } finally {
      setIsSavingImport(false);
    }
  };

  if (!entry) {
    return (
      <PageLayout>
        <div className="px-8 py-8">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold">No Active Queue Context</h1>
            <p className="mt-3 text-muted-foreground">
              Scan a patient queue slip or open this page using a valid `queueId`.
            </p>
            <Button asChild className="mt-6">
              <Link href="/staff/queue">Back to Queue Management</Link>
            </Button>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">
              {lane} Station
            </p>
            <h1 className="mt-2 text-3xl font-bold">Scanned Patient Workflow</h1>
            <p className="mt-2 text-muted-foreground">
              {lane === 'BLOOD TEST'
                ? 'Use the scanned queue context to handle CBC or urinalysis under the BLOOD TEST station and return the patient to general intake once done.'
                : 'Use the scanned queue context to start this lab step and return the patient to general intake once done.'}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={getQueueScanPath(entry.id)}>Open QR Context</Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.3fr]">
          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Queue Number
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight text-primary">
                  {entry.queueNumber}
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <QrCode className="h-7 w-7" />
              </div>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Patient
                </p>
                <p className="mt-1 font-semibold">{entry.patientName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Service Type
                </p>
                <p className="mt-1 font-semibold">{entry.serviceType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Current Lane
                </p>
                <p className="mt-1 font-semibold">{entry.currentLane}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Queue Status
                </p>
                <p className="mt-1 font-semibold">{entry.status}</p>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <ScanLine className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Station Actions</h2>
                  <p className="text-sm text-muted-foreground">
                    This screen is opened automatically after scanning the patient slip at the{' '}
                    {lane} station.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">Step Status</p>
                <p className="mt-1 text-muted-foreground">
                  {isCompletedHere
                    ? `${lane} is already completed for this patient.`
                    : isCurrentLane
                      ? `Patient is already inside ${lane}. Upload the machine result, then mark the step complete.`
                      : hasPendingStep
                        ? `${lane} is still pending, but the patient has not been moved into this lab yet. Accept or call the patient from queue management first.`
                        : `No pending ${lane} step is available for this patient.`}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleCompleteStep}
                  disabled={!isServingHere}
                >
                  Mark Step Complete
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Beaker className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Workflow Summary</h2>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pending Steps
                  </p>
                  {entry.pendingLanes.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm">
                      {entry.pendingLanes.map((pendingLane) => (
                        <li
                          key={pendingLane}
                          className={`rounded-lg px-3 py-2 font-medium ${
                            pendingLane === lane
                              ? 'bg-primary/10 text-primary'
                              : 'bg-background'
                          }`}
                        >
                          {pendingLane}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No pending steps.</p>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Completed Steps
                  </p>
                  {entry.completedLanes.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm">
                      {entry.completedLanes.map((completedLane) => (
                        <li key={completedLane} className="rounded-lg bg-background px-3 py-2 font-medium">
                          {completedLane}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No completed steps yet.</p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <FileUp className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-bold">Upload Machine Result</h2>
                  <p className="text-sm text-muted-foreground">
                    Import the analyzer TXT output for this patient&apos;s active {lane} step.
                    {lane === 'BLOOD TEST'
                      ? ' Choose whether you are uploading a hematology/CBC file or a urinalysis file before saving.'
                      : ''}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                {lane === 'BLOOD TEST' && (
                  <div className="mb-5">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Blood Test File Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={bloodTestCategory === 'hematology' ? 'default' : 'outline'}
                        onClick={() => setBloodTestCategory('hematology')}
                      >
                        Hematology / CBC
                      </Button>
                      <Button
                        type="button"
                        variant={bloodTestCategory === 'urinalysis' ? 'default' : 'outline'}
                        onClick={() => setBloodTestCategory('urinalysis')}
                      >
                        Urinalysis
                      </Button>
                    </div>
                  </div>
                )}

                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Machine TXT File
                </label>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleImportFile}
                  className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {parsedImport && (
                <div className="mt-6 space-y-4">
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm md:grid-cols-3">
                    <p>
                      Order ID:{' '}
                      <span className="font-medium text-foreground">{parsedImport.orderId}</span>
                    </p>
                    <p>
                      Patient:{' '}
                      <span className="font-medium text-foreground">{parsedImport.patientName}</span>
                    </p>
                    <p>
                      Test:{' '}
                      <span className="font-medium text-foreground">{parsedImport.testName}</span>
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Analyte</th>
                          <th className="px-4 py-3 text-left font-semibold">Value</th>
                          <th className="px-4 py-3 text-left font-semibold">Unit</th>
                          <th className="px-4 py-3 text-left font-semibold">Reference Range</th>
                          <th className="px-4 py-3 text-left font-semibold">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedImport.results.map((result) => (
                          <tr key={`${result.name}-${result.value}`} className="border-t border-border">
                            <td className="px-4 py-3 font-medium">{result.name}</td>
                            <td className="px-4 py-3">{result.value}</td>
                            <td className="px-4 py-3">{result.unit || '—'}</td>
                            <td className="px-4 py-3">{result.referenceRange || '—'}</td>
                            <td className="px-4 py-3">{result.flag || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Raw File Preview
                    </p>
                    <pre className="max-h-56 overflow-auto rounded-xl border border-border bg-slate-950 p-4 text-xs text-slate-100">
                      {rawImportText}
                    </pre>
                  </div>

                  <Button onClick={handleSaveImport} disabled={isSavingImport}>
                    {isSavingImport ? 'Saving...' : 'Save Imported Result'}
                  </Button>
                </div>
              )}

              {savedMachineResult && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">Saved Result on File</p>
                  <p className="mt-1">
                    {savedMachineResult.testName} imported on{' '}
                    {new Date(savedMachineResult.importedAt).toLocaleString()} with{' '}
                    {savedMachineResult.results.length} analytes.
                  </p>
                </div>
              )}

              {importError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {importError}
                </div>
              )}

              {importMessage && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  {importMessage}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function LabOrdersPage() {
  return (
    <Suspense fallback={null}>
      <LabOrdersPageContent />
    </Suspense>
  );
}
