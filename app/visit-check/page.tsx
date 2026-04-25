'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CalendarDays, CheckCircle2, Download, SearchCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type VisitCheckPayload = {
  status: string;
  registration?: {
    code: string;
    status: string;
    service: string;
  } | null;
  queue?: {
    id: string;
    queueNumber: string;
    visitId: string;
    status: string;
    lane: string;
    counter: string;
    calledAt?: string | null;
    pingCount: number;
    responseAt?: string | null;
    missedAt?: string | null;
    requeueRequiredAt?: string | null;
    pendingStations: string[];
    completedStations: string[];
  } | null;
  result?: {
    availability: string;
    orderCount: number;
    reportCount: number;
    releasedAt?: string | null;
    canView: boolean;
  };
};

function getStatusLabel(status: string) {
  switch (status) {
    case 'now_serving':
      return 'Now Serving';
    case 'requeue_required':
      return 'Re-Queue Required';
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

export default function VisitCheckPage() {
  const [formData, setFormData] = useState({
    registrationReference: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    emailAddress: '',
  });
  const [result, setResult] = useState<VisitCheckPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isRequeueing, setIsRequeueing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPassword, setDownloadPassword] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [error, setError] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [queueQrDataUrl, setQueueQrDataUrl] = useState('');
  const latestFormDataRef = useRef(formData);

  useEffect(() => {
    latestFormDataRef.current = formData;
  }, [formData]);

  const fetchVisit = async (options: { showLoading?: boolean; resetPassword?: boolean } = {}) => {
    if (options.showLoading) {
      setIsLoading(true);
    }
    setError('');
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
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to acknowledge queue call.');
      }

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
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to re-queue visit.');
      }

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
              Use the registration ID together with the same patient details used during registration
              to check today&apos;s clinic visit and queue call status.
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

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                  First Name
                </label>
                <Input
                  className="h-12"
                  name="firstName"
                  placeholder="Enter first name"
                  value={formData.firstName}
                  onChange={(event) => setFormData((current) => ({ ...current, firstName: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                  Last Name
                </label>
                <Input
                  className="h-12"
                  name="lastName"
                  placeholder="Enter last name"
                  value={formData.lastName}
                  onChange={(event) => setFormData((current) => ({ ...current, lastName: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
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
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                  Email Address
                </label>
                <Input
                  className="h-12"
                  name="emailAddress"
                  type="email"
                  placeholder="name@email.com"
                  value={formData.emailAddress}
                  onChange={(event) => setFormData((current) => ({ ...current, emailAddress: event.target.value }))}
                  required
                />
              </div>
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

          {result && (
            <div
              className={cn(
                'mt-6 rounded-md border border-border bg-muted/40 p-5',
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
                <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
                  <div className="rounded-[22px] border border-[#bfd0e3] bg-white px-6 py-5 text-center shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#0b65b1]">
                      Globalife Medical Laboratory &amp; Polyclinic
                    </p>
                    <p className="mt-3 text-[22px] font-bold text-slate-900">Queue Slip</p>
                    <p className="mt-3 text-[64px] font-black leading-none text-[#0b65b1]">
                      {result.queue.queueNumber}
                    </p>
                    <p className="mt-4 text-[15px] font-semibold text-slate-900">
                      {latestFormDataRef.current.firstName} {latestFormDataRef.current.lastName}
                    </p>
                    {result.registration?.code ? (
                      <p className="mt-1 text-[13px] font-medium text-slate-600">
                        Ref ID: {result.registration.code}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[15px] text-slate-700">
                      {result.registration?.service ?? result.queue.lane}
                    </p>
                    <p className="mt-1 text-[15px] text-slate-700">
                      Pending:{' '}
                      {result.queue.pendingStations.length > 0 ? result.queue.pendingStations.join(', ') : 'N/A'}
                    </p>
                    <p className="mt-1 text-[15px] text-slate-700">
                      {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : ''}
                    </p>
                    <div className="mt-5 flex justify-center">
                      {queueQrDataUrl ? (
                        <img src={queueQrDataUrl} alt="Queue QR code" className="h-44 w-44" />
                      ) : (
                        <div className="h-44 w-44 rounded border border-dashed border-slate-300 bg-slate-50" />
                      )}
                    </div>
                    <p className="mt-5 text-xs text-slate-700">
                      Scan QR to open the patient&apos;s active visit/profile.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Station
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {result.queue.counter || result.queue.lane}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Current Lane
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{result.queue.lane}</p>
                      </div>
                      <div className="rounded-xl border bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Response
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {result.queue.responseAt ? 'Received' : 'Not yet'}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Ping Count
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{result.queue.pingCount}/3</p>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Queue Route
                      </p>
                      <div className="mt-3 space-y-3 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">Pending Stations</p>
                          <p className="mt-1 leading-6 text-slate-700">
                            {result.queue.pendingStations.length > 0 ? result.queue.pendingStations.join(', ') : 'None'}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Completed Stations</p>
                          <p className="mt-1 leading-6 text-slate-700">
                            {result.queue.completedStations.length > 0 ? result.queue.completedStations.join(', ') : 'None'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : result.registration ? (
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <p>Registration Code: <span className="font-semibold">{result.registration.code}</span></p>
                  <p>Service: <span className="font-semibold">{result.registration.service}</span></p>
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
                <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Your queue call expired after three notifications. You can re-queue here to receive a new queue number.
                </p>
              )}

              {result.queue?.status === 'missed' && (
                <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Your queue call was marked missed. Re-queue to return to the waiting line with a new queue number.
                </p>
              )}

              {result.queue && (
                <div className="mt-5 rounded-md border border-border bg-background p-4">
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
