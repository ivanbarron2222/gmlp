'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Beaker, Eye, FileUp, RefreshCw, ScanLine, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageLayout } from '@/components/layout/page-layout';
import { fetchQueueEntry, postQueueAction } from '@/lib/queue-api';
import { getQueueVisitPath, QueueEntry, QueueLane } from '@/lib/queue-store';
import {
  findVisitByQueueEntryId,
  MachineResultImport,
  saveVisitMachineResult,
} from '@/lib/patient-records-store';
import { parseMachineResultText, type ParsedMachineResult } from '@/lib/machine-result-parser';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type LabLane = Extract<QueueLane, 'BLOOD TEST' | 'DRUG TEST' | 'XRAY' | 'ECG'>;
type BloodTestCategory = 'hematology' | 'urinalysis';
type XrayReport = {
  id: string;
  importedAt: string;
  orderId: string;
  examType: string;
  xrayNumber: string;
  findings: string[];
  impression: string;
  remarks: string;
  rawText: string;
};

type LabOrderRequest = {
  id: string;
  labOrderId: string;
  orderNumber: string;
  queueId: string;
  queueNumber: string;
  patientName: string;
  testName: string;
  lane: LabLane;
  status: string;
  specimenStatus: string;
  requestedAt: string;
  hasResult: boolean;
  resultUploadedAt: string | null;
};

const supportedLanes: LabLane[] = ['BLOOD TEST', 'DRUG TEST', 'XRAY', 'ECG'];

function readLaneParam(rawLane: string | null): LabLane {
  return supportedLanes.includes(rawLane as LabLane) ? (rawLane as LabLane) : 'BLOOD TEST';
}

async function getStaffAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase!.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Missing authenticated session.');
  }

  return session.access_token;
}

function LabOrdersPageContent() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get('queueId');
  const lane = readLaneParam(searchParams.get('lane'));
  const mode = searchParams.get('mode') === 'result' ? 'result' : 'station';
  const isResultMode = mode === 'result';
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [labOrders, setLabOrders] = useState<LabOrderRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [parsedImport, setParsedImport] = useState<ParsedMachineResult | null>(null);
  const [rawImportText, setRawImportText] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [savedImportFromDb, setSavedImportFromDb] = useState<MachineResultImport | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [bloodTestCategory, setBloodTestCategory] = useState<BloodTestCategory>('hematology');
  const [savedXrayReport, setSavedXrayReport] = useState<XrayReport | null>(null);
  const [xrayExamType, setXrayExamType] = useState('Chest PA');
  const [xrayNumber, setXrayNumber] = useState('');
  const [xrayFindings, setXrayFindings] = useState('');
  const [xrayImpression, setXrayImpression] = useState('');
  const [xrayRemarks, setXrayRemarks] = useState('');

  const loadLabOrders = async (search = searchQuery) => {
    setIsLoadingOrders(true);
    setOrdersError('');

    try {
      const token = await getStaffAccessToken();
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const response = await fetch(
        `/api/staff/lab-orders${params.toString() ? `?${params.toString()}` : ''}`,
        {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const payload = (await response.json()) as {
        error?: string;
        labOrders?: LabOrderRequest[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load lab orders.');
      }

      setLabOrders(payload.labOrders ?? []);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : 'Unable to load lab orders.');
      setLabOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (!queueId) {
      void loadLabOrders('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId]);

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

    if (lane === 'ECG') {
      setSavedImportFromDb(null);
      setSavedXrayReport(null);
      return () => controller.abort();
    }

    if (lane === 'XRAY') {
      setSavedImportFromDb(null);

      fetch(`/api/staff/xray-report?queueId=${encodeURIComponent(queueId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error ?? 'Unable to load saved xray report.');
          }

          return (await response.json()) as { xrayReport: XrayReport | null };
        })
        .then((payload) => {
          setSavedXrayReport(payload.xrayReport);
          if (payload.xrayReport) {
            setXrayExamType(payload.xrayReport.examType || 'Chest PA');
            setXrayNumber(payload.xrayReport.xrayNumber || '');
            setXrayFindings(payload.xrayReport.findings.join('\n'));
            setXrayImpression(payload.xrayReport.impression || '');
            setXrayRemarks(payload.xrayReport.remarks || '');
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setImportError(error instanceof Error ? error.message : 'Unable to load saved xray report.');
            setSavedXrayReport(null);
          }
        });

      return () => controller.abort();
    }

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
          Authorization: `Bearer ${await getStaffAccessToken()}`,
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

  const handleSaveXrayReport = async () => {
    if (!entry || !queueId) {
      return;
    }

    setIsSavingImport(true);
    setImportError('');
    setImportMessage('');

    try {
      const response = await fetch('/api/staff/xray-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getStaffAccessToken()}`,
        },
        body: JSON.stringify({
          queueId,
          examType: xrayExamType,
          xrayNumber,
          findings: xrayFindings,
          impression: xrayImpression,
          remarks: xrayRemarks,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Unable to save xray report.');
      }

      const payload = (await response.json()) as { xrayReport: XrayReport };
      setSavedXrayReport(payload.xrayReport);
      setImportMessage(`Xray report saved to database for ${entry.patientName}.`);

      saveVisitMachineResult(queueId, {
        id: payload.xrayReport.id,
        lane: 'XRAY',
        importedAt: payload.xrayReport.importedAt,
        orderId: payload.xrayReport.orderId,
        patientName: entry.patientName,
        testName: payload.xrayReport.examType,
        rawText: payload.xrayReport.rawText,
        results: [],
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to save xray report.');
    } finally {
      setIsSavingImport(false);
    }
  };

  if (!queueId) {
    const counters = {
      total: labOrders.length,
      pending: labOrders.filter((item) => item.specimenStatus !== 'completed').length,
      completed: labOrders.filter((item) => item.specimenStatus === 'completed').length,
      withResults: labOrders.filter((item) => item.hasResult).length,
    };

    return (
      <PageLayout>
        <div className="px-8 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">Lab Requests</p>
              <h1 className="mt-2 text-3xl font-bold">Lab Orders</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                View blood test, drug test, xray, and ECG requests. Open a request to upload machine results or encode findings.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="min-w-28 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="mt-2 text-3xl font-black">{counters.total}</p>
              </Card>
              <Card className="min-w-28 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="mt-2 text-3xl font-black text-amber-600">{counters.pending}</p>
              </Card>
              <Card className="min-w-28 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tested</p>
                <p className="mt-2 text-3xl font-black text-emerald-600">{counters.completed}</p>
              </Card>
              <Card className="min-w-28 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Results</p>
                <p className="mt-2 text-3xl font-black text-primary">{counters.withResults}</p>
              </Card>
            </div>
          </div>

          {ordersError && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {ordersError}
            </div>
          )}

          <Card className="mt-8 p-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search patient, order number, queue number, or test..."
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void loadLabOrders(searchQuery)}>
                  Search
                </Button>
                <Button variant="outline" onClick={() => void loadLabOrders('')}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </Card>

          <Card className="mt-8 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Request List</h2>
                <p className="text-sm text-muted-foreground">
                  Open a request to view patient context and upload the machine result.
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {labOrders.length} requests
              </span>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border">
              <div className="max-h-[42rem] overflow-auto">
                <table className="w-full min-w-[68rem] text-sm">
                  <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Order</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Patient</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Request</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Result</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{order.orderNumber || 'No order no.'}</p>
                          <p className="text-xs text-muted-foreground">{order.queueNumber || 'No queue no.'}</p>
                        </td>
                        <td className="px-4 py-3">{order.patientName || 'Unknown patient'}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{order.testName}</p>
                          <p className="text-xs text-muted-foreground">{order.lane}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{order.specimenStatus.replaceAll('_', ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {order.hasResult ? (
                            <div>
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                Uploaded
                              </Badge>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {order.resultUploadedAt ? new Date(order.resultUploadedAt).toLocaleString() : ''}
                              </p>
                            </div>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                              No result
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {order.queueId ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/staff/lab-orders?queueId=${encodeURIComponent(order.queueId)}&lane=${encodeURIComponent(order.lane)}&mode=result`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">No queue context</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!labOrders.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          {isLoadingOrders ? 'Loading lab requests...' : 'No lab requests found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      </PageLayout>
    );
  }

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
            <h1 className="mt-2 text-3xl font-bold">
              {isResultMode ? 'Lab Result Workflow' : 'Queue Station Workflow'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {isResultMode
                ? `Upload or encode the ${lane} result for this lab request.`
                : lane === 'BLOOD TEST'
                  ? 'Use this station view for blood extraction only. No machine upload is needed here; mark the queue step complete after extraction.'
                  : `Use this station view for the ${lane} queue step. Mark the queue step complete after the station work is done.`}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={getQueueVisitPath(entry.id)}>View Patient Visit</Link>
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
                <FileUp className="h-7 w-7" />
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
            {!isResultMode ? (
            <>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <ScanLine className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {lane === 'BLOOD TEST' ? 'Blood Extraction' : `${lane} Station`}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {lane === 'BLOOD TEST'
                      ? 'Complete this step after the blood sample has been collected. Testing and machine upload happen later from the Lab Orders list.'
                      : 'Complete this queue step after the station work is done. Result upload or encoding happens from the Lab Orders list.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">Step Status</p>
                <p className="mt-1 text-muted-foreground">
                  {isCompletedHere
                    ? `${lane} is already completed for this patient.`
                    : isCurrentLane
                      ? `Patient is currently inside ${lane}. Mark complete when the station task is done.`
                      : hasPendingStep
                        ? `${lane} is still pending, but the patient has not been moved into this station yet. Call the patient from queue management first.`
                        : `No pending ${lane} step is available for this patient.`}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleCompleteStep} disabled={!isServingHere}>
                  Mark Step Complete
                </Button>
                <Button asChild variant="outline">
                  <Link href="/staff/lab-orders">Open Lab Orders List</Link>
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Beaker className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Station Summary</h2>
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
            </>
            ) : lane === 'XRAY' ? (
            <>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <ScanLine className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Station Actions</h2>
                  <p className="text-sm text-muted-foreground">
                    Encode the xray narrative for this patient, then mark the step complete from this station.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">Step Status</p>
                <p className="mt-1 text-muted-foreground">
                  {isCompletedHere
                    ? `${lane} is already completed for this patient.`
                    : isCurrentLane
                      ? `Patient is already inside ${lane}. Save the xray findings, then mark the step complete.`
                      : hasPendingStep
                        ? `${lane} is still pending, but the patient has not been moved into this station yet. Call the patient from queue management first.`
                        : `No pending ${lane} step is available for this patient.`}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleCompleteStep} disabled={!isServingHere}>
                  Mark Step Complete
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <FileUp className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-bold">XRAY Narrative Entry</h2>
                  <p className="text-sm text-muted-foreground">
                    Encode the exam type, findings, and impression for this xray study.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Exam Type
                  </label>
                  <input
                    value={xrayExamType}
                    onChange={(event) => setXrayExamType(event.target.value)}
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Chest PA"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Xray Number
                  </label>
                  <input
                    value={xrayNumber}
                    onChange={(event) => setXrayNumber(event.target.value)}
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="XR-9316"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Findings
                </label>
                <textarea
                  value={xrayFindings}
                  onChange={(event) => setXrayFindings(event.target.value)}
                  className="min-h-[180px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder={'No definite focal infiltrates.\nHeart is not enlarged.\nAorta is unremarkable.'}
                />
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Impression
                </label>
                <textarea
                  value={xrayImpression}
                  onChange={(event) => setXrayImpression(event.target.value)}
                  className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Normal chest findings"
                />
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Remarks
                </label>
                <textarea
                  value={xrayRemarks}
                  onChange={(event) => setXrayRemarks(event.target.value)}
                  className="min-h-[84px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Optional remarks"
                />
              </div>

              <div className="mt-5">
                <Button onClick={handleSaveXrayReport} disabled={isSavingImport}>
                  {isSavingImport ? 'Saving...' : 'Save Xray Report'}
                </Button>
              </div>

              {savedXrayReport && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">Saved XRAY Report on File</p>
                  <p className="mt-1">
                    {savedXrayReport.examType} saved on{' '}
                    {new Date(savedXrayReport.importedAt).toLocaleString()}
                    {savedXrayReport.xrayNumber ? ` as ${savedXrayReport.xrayNumber}` : ''}.
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
            </>
            ) : (
            <>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <ScanLine className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Station Actions</h2>
                  <p className="text-sm text-muted-foreground">
                    This screen is opened directly from queue management for the{' '}
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
            </>
            )}
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
