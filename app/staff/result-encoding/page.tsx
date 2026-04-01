'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ClipboardPlus, Stethoscope } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import { fetchQueueEntry, postQueueAction } from '@/lib/queue-api';
import { getQueueVisitPath, QueueEntry } from '@/lib/queue-store';

function ResultEncodingPageContent() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get('queueId');
  const [entry, setEntry] = useState<QueueEntry | null>(null);

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

  const canConsult = entry?.pendingLanes.includes('DOCTOR') ?? false;
  const isInDoctor = entry?.currentLane === 'DOCTOR';
  const isServingDoctor = isInDoctor && entry?.status === 'serving';
  const isCheckUp = entry?.serviceType === 'CHECK-UP';

  const handleStartConsultation = async () => {
    if (!entry || !queueId) {
      return;
    }

    const nextQueue = await postQueueAction({ action: 'start_step', queueId, lane: 'DOCTOR' });
    setEntry(nextQueue.find((item) => item.id === queueId) ?? null);
  };

  const handleCompleteConsultation = async () => {
    if (!entry || !queueId) {
      return;
    }

    const nextQueue = await postQueueAction({ action: 'finish_step', queueId });
    setEntry(nextQueue.find((item) => item.id === queueId) ?? null);
  };

  const handleAddReferral = async (lane: 'BLOOD TEST' | 'DRUG TEST' | 'XRAY') => {
    if (!entry || !queueId) {
      return;
    }

    const nextQueue = await postQueueAction({ action: 'add_referral', queueId, lane });
    setEntry(nextQueue.find((item) => item.id === queueId) ?? null);
  };

  if (!entry) {
    return (
      <PageLayout>
        <div className="px-8 py-8">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold">No Active Consultation Context</h1>
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
              Doctor Station
            </p>
            <h1 className="mt-2 text-3xl font-bold">Consultation Workflow</h1>
            <p className="mt-2 text-muted-foreground">
              Manage check-up and pre-employment doctor steps directly from the selected queue visit.
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
                <Stethoscope className="h-7 w-7" />
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
                  <Stethoscope className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Consultation Actions</h2>
                  <p className="text-sm text-muted-foreground">
                    Start the doctor step, add optional referrals for check-up patients, then
                    complete the consultation.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">Doctor Step Status</p>
                <p className="mt-1 text-muted-foreground">
                  {entry.completedLanes.includes('DOCTOR')
                    ? 'Doctor consultation is already completed.'
                    : canConsult
                      ? 'Doctor consultation is pending and can be started now.'
                      : 'No active doctor step is available for this patient.'}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  onClick={handleStartConsultation}
                  disabled={!canConsult || entry.completedLanes.includes('DOCTOR')}
                >
                  {isInDoctor ? 'Resume Consultation' : 'Start Consultation'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCompleteConsultation}
                  disabled={!isServingDoctor}
                >
                  Complete Consultation
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <ClipboardPlus className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Doctor Referrals</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                For check-up patients, add lab referrals only if the doctor requests them.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleAddReferral('BLOOD TEST')}
                  disabled={!isCheckUp}
                >
                  Add Blood Test
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAddReferral('DRUG TEST')}
                  disabled={!isCheckUp}
                >
                  Add Drug Test
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAddReferral('XRAY')}
                  disabled={!isCheckUp}
                >
                  Add Xray
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-bold">Workflow Summary</h2>
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
                            pendingLane === 'DOCTOR'
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
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function ResultEncodingPage() {
  return (
    <Suspense fallback={null}>
      <ResultEncodingPageContent />
    </Suspense>
  );
}
