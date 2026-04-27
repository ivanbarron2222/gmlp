'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CalendarDays, CheckCircle2, Download, SearchCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useQueuePingSound } from '@/hooks/use-queue-ping-sound';
import { cn } from '@/lib/utils';

type VisitCheckPayload = {
  status: string;
  patientName?: string;
  registration?: {
    code: string;
    status: string;
    service: string;
  } | null;
  queue?: {
    id: string;
    queueNumber: string;
    previousQueueNumber?: string | null;
    visitId: string;
    status: string;
    lane: string;
    counter: string;
    calledAt?: string | null;
    pingCount: number;
    responseAt?: string | null;
    missedAt?: string | null;
    requeueRequiredAt?: string | null;
    lastRequeuedAt?: string | null;
    requeueCount: number;
    pendingStations: string[];
    completedStations: string[];
  } | null;
  result?: {
    availability: string;
    orderCount: number;
    reportCount: number;
    labOrderNumbers?: string[];
    releasedAt?: string | null;
    canView: boolean;
  };
};

function getStatusLabel(status: string) {
  switch (status) {
    case 'now_serving':
      return 'In Progress';
    case 'requeue_required':
      return 'Ready to Re-Queue';
    case 'missed':
      return 'Missed Call';
    case 'waiting':
      return 'Waiting';
    case 'pending':
      return 'Pending Verification';
    case 'verified':
      return 'Verified';
    case 'not_found':
      return 'No Same-Day Visit Found';
    default:
      return status.replaceAll('_', ' ');
  }
}

function getResultLabel(availability?: string) {
  switch (availability) {
    case 'released':
      return 'Result Released';
    case 'validated':
      return 'Result Validated, Pending Release';
    case 'pending_validation':
      return 'Result Pending Validation';
    default:
      return 'No Result Yet';
  }
}

function formatSlipDateTime(value: string) {
  const date = new Date(value);

  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString(),
  };
}

function formatSlipService(value: string) {
  switch (value) {
    case 'pre_employment':
      return 'PRE-EMPLOYMENT';
    case 'check_up':
      return 'CHECK-UP';
    case 'lab':
      return 'LAB';
    default:
      return value;
  }
}

export default function VisitCheckPage() {
  const [formData, setFormData] = useState({
    registrationReference: '',
    birthDate: '',
  });
  const [result, setResult] = useState<VisitCheckPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isRequeueing, setIsRequeueing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPassword, setDownloadPassword] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [error, setError] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [queueQrDataUrl, setQueueQrDataUrl] = useState('');
  const latestFormDataRef = useRef(formData);

  useQueuePingSound({
    queueId: result?.queue?.id,
    status: result?.queue?.status,
    responseAt: result?.queue?.responseAt,
  });

  useEffect(() => {
    latestFormDataRef.current = formData;
  }, [formData]);

  const fetchVisit = async (options: { showLoading?: boolean; resetPassword?: boolean } = {}) => {
    if (options.showLoading) {
      setIsLoading(true);
    }
    setError('');
    setActionNotice('');
    setDownloadError('');

    try {
      const response = await fetch('/api/public/visit-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latestFormDataRef.current),
      });
      const payload = (await response.json()) as VisitCheckPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to check visit.');
      }

      setResult(payload);
      setIsLive(payload.status !== 'not_found');
      setLastUpdatedAt(new Date().toISOString());
      if (options.resetPassword) {
        setDownloadPassword('');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to check visit.');
      setIsLive(false);
      setResult(null);
    } finally {
      if (options.showLoading) {
        setIsLoading(false);
      }
    }
  };

  const checkVisit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetchVisit({ showLoading: true, resetPassword: true });
  };

  useEffect(() => {
    if (!isLive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchVisit();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isLive]);

  useEffect(() => {
    const queueId = result?.queue?.id;
    if (!queueId || typeof window === 'undefined') {
      setQueueQrDataUrl('');
      return;
    }

    const scanUrl = new URL(`/scan/queue/${queueId}`, window.location.origin).toString();
    QRCode.toDataURL(scanUrl, { margin: 1, width: 200 })
      .then((dataUrl) => setQueueQrDataUrl(dataUrl))
      .catch(() => setQueueQrDataUrl(''));
  }, [result?.queue?.id]);

  const acknowledgeCall = async () => {
    if (!result?.queue?.id) {
      return;
    }

    setIsAcknowledging(true);
    setError('');

    try {
      const response = await fetch('/api/public/visit-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, queueId: result.queue.id, action: 'acknowledge' }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; notice?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to acknowledge queue call.');
      }

      setActionNotice(payload?.notice ?? 'Queue call acknowledged.');
      await fetchVisit();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to acknowledge queue call.');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const requeueVisit = async () => {
    if (!result?.queue?.id) {
      return;
    }

    setIsRequeueing(true);
    setError('');

    try {
      const response = await fetch('/api/public/visit-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, queueId: result.queue.id, action: 'requeue' }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; notice?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to re-queue visit.');
      }

      setActionNotice(payload?.notice ?? 'Re-queued successfully.');
      await fetchVisit({ resetPassword: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to re-queue visit.');
    } finally {
      setIsRequeueing(false);
    }
  };

  const downloadResult = async () => {
    if (!result?.queue?.id) {
      return;
    }

    setIsDownloading(true);
    setDownloadError('');

    try {
      const response = await fetch('/api/public/report-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          queueId: result.queue.id,
          password: downloadPassword,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Unable to prepare protected download.');
      }

      const zipBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `gmlp-result-${result.queue.queueNumber}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (nextError) {
      setDownloadError(
        nextError instanceof Error ? nextError.message : 'Unable to prepare protected download.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const slipDateTime = formatSlipDateTime(lastUpdatedAt ?? new Date().toISOString());

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-secondary px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to portal
          </Link>
          <Button asChild variant="outline">
            <Link href="/register">Register Patient</Link>
          </Button>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SearchCheck className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Same-day verification
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Check Visit / Results</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use the registration ID and birth date to check today&apos;s clinic visit, queue status,
              and result availability.
            </p>
          </div>

          <form className="grid gap-5" onSubmit={checkVisit}>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                Registration ID
              </label>
              <Input
                className="h-12"
                name="registrationReference"
                placeholder="REG-..."
                value={formData.registrationReference}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    registrationReference: event.target.value,
                  }))
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Use the registration ID from the patient registration slip. Queue numbers can change after re-queue.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                Birth Date
              </label>
              <Input
                className="h-12"
                name="birthDate"
                type="date"
                value={formData.birthDate}
                onChange={(event) => setFormData((current) => ({ ...current, birthDate: event.target.value }))}
                required
              />
            </div>

            <Button type="submit" className="h-12 text-base" disabled={isLoading}>
              <CalendarDays className="h-5 w-5" />
              {isLoading ? 'Checking...' : "Check Today's Visit"}
            </Button>
          </form>

          {error && (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {actionNotice && (
            <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {actionNotice}
            </div>
          )}

          {result && (
            <div
              className={cn(
                'mt-6 rounded-md border border-border bg-muted/30 p-5 sm:p-6',
                result.queue?.status === 'now_serving' &&
                  !result.queue.responseAt &&
                  'animate-pulse border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300'
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 font-semibold',
                    isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {isLive ? 'Live updates on' : 'Live updates off'}
                </span>
                {lastUpdatedAt && <span>Updated {new Date(lastUpdatedAt).toLocaleTimeString()}</span>}
                {result.queue?.status === 'now_serving' ? <span>Call {result.queue.pingCount}/3</span> : null}
              </div>
              <h2
                className={cn(
                  'mt-2 text-2xl font-bold',
                  result.queue?.status === 'now_serving' && !result.queue.responseAt && 'text-emerald-700'
                )}
              >
                {getStatusLabel(result.status)}
              </h2>

              {result.queue ? (
                <div className="mt-5">
                  <div className="mx-auto w-full max-w-sm rounded-[18px] border border-slate-300 bg-white p-6 text-center shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0b65b1]">
                      Globalife Medical Laboratory &amp; Polyclinic
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">Queue Slip</p>
                    <p className="mt-3 text-[52px] font-black leading-none text-[#0b65b1]">
                      {result.queue.queueNumber}
                    </p>

                    <div className="mt-4 space-y-1 text-sm leading-6 text-slate-600">
                      <p className="font-semibold text-slate-900">{result.patientName || 'Patient'}</p>
                      {result.registration?.code ? (
                        <p>
                          Registration ID:{' '}
                          <span className="font-semibold text-slate-900">{result.registration.code}</span>
                        </p>
                      ) : null}
                      <p>Service: {formatSlipService(result.registration?.service ?? result.queue.lane)}</p>
                      <p>Lab Order: {result.result?.labOrderNumbers?.join(', ') || 'N/A'}</p>
                      <p>Pending: {result.queue.pendingStations.join(', ') || 'N/A'}</p>
                      <p>Date: {slipDateTime.date}</p>
                      <p>Time: {slipDateTime.time}</p>
                    </div>

                    <div className="mt-4 flex justify-center">
                      {queueQrDataUrl ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-2">
                          <img src={queueQrDataUrl} alt="Queue QR code" className="h-32 w-32" />
                        </div>
                      ) : (
                        <div className="h-36 w-36 rounded border border-dashed border-slate-300 bg-slate-50" />
                      )}
                    </div>
                    <p className="mt-4 text-xs text-slate-500">
                      Scan QR to open the patient&apos;s active visit/profile.
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 text-center text-sm text-muted-foreground">
                    {result.queue.previousQueueNumber ? (
                      <p>
                        Re-queued from <span className="font-semibold text-foreground">{result.queue.previousQueueNumber}</span>{' '}
                        to <span className="font-semibold text-foreground">{result.queue.queueNumber}</span>.
                      </p>
                    ) : null}
                    {result.queue.requeueCount > 0 ? (
                      <p>
                        Re-queued {result.queue.requeueCount} time{result.queue.requeueCount > 1 ? 's' : ''}.
                        Completed stations stay completed.
                      </p>
                    ) : result.queue.completedStations.length > 0 ? (
                      <p>Completed stations stay completed. Only remaining stations continue.</p>
                    ) : null}
                  </div>
                </div>
              ) : result.registration ? (
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <p>Registration ID: <span className="font-semibold text-foreground">{result.registration.code}</span></p>
                  <p>Service: <span className="font-semibold text-foreground">{result.registration.service}</span></p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No pending registration or active queue was found for today.
                </p>
              )}

              {result.queue?.status === 'now_serving' && !result.queue.responseAt && (
                <Button
                  type="button"
                  className="mt-5 h-11"
                  onClick={() => void acknowledgeCall()}
                  disabled={isAcknowledging}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isAcknowledging ? 'Sending...' : "I'm Here"}
                </Button>
              )}

              {(result.queue?.status === 'requeue_required' || result.queue?.status === 'missed') && (
                <Button
                  type="button"
                  className="mt-5 h-11"
                  onClick={() => void requeueVisit()}
                  disabled={isRequeueing}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isRequeueing ? 'Re-Queueing...' : 'Re-Queue'}
                </Button>
              )}

              {result.queue?.status === 'requeue_required' && (
                <p className="mt-5 text-sm text-amber-800">
                  Your call was not acknowledged after three calls. Re-queue to continue the remaining stations with a new queue number.
                </p>
              )}

              {result.queue?.status === 'missed' && (
                <p className="mt-5 text-sm text-amber-800">
                  Your queue was marked missed. Re-queue to return to the waiting line. Completed stations will be kept.
                </p>
              )}

              {result.queue && (
                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Result Status
                  </p>
                  <p className="mt-2 text-lg font-bold">{getResultLabel(result.result?.availability)}</p>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <p>Lab Orders: <span className="font-semibold text-foreground">{result.result?.orderCount ?? 0}</span></p>
                    <p>Reports: <span className="font-semibold text-foreground">{result.result?.reportCount ?? 0}</span></p>
                    {result.result?.releasedAt && (
                      <p className="sm:col-span-2">
                        Released: <span className="font-semibold text-foreground">{new Date(result.result.releasedAt).toLocaleString()}</span>
                      </p>
                    )}
                  </div>

                  {result.result?.canView && (
                    <div className="mt-4 grid gap-3">
                      <Button asChild className="h-10">
                        <Link href={`/report/${encodeURIComponent(result.queue.id)}`} target="_blank">
                          View Result
                        </Link>
                      </Button>
                      <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_auto]">
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                            Download Password
                          </label>
                          <Input
                            className="h-10"
                            type="password"
                            placeholder="Last name + last 4 digits of Patient ID"
                            value={downloadPassword}
                            onChange={(event) => setDownloadPassword(event.target.value)}
                          />
                          {downloadError && (
                            <p className="mt-2 text-xs font-medium text-red-700">{downloadError}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 self-end"
                          onClick={() => void downloadResult()}
                          disabled={isDownloading || !downloadPassword.trim()}
                        >
                          <Download className="h-4 w-4" />
                          {isDownloading ? 'Preparing...' : 'Download Result'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The downloaded ZIP uses the patient last name followed by the last 4 digits of the Patient ID.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
