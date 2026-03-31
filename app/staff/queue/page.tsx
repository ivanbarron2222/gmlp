'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/page-layout';
import { fetchQueueEntries, postQueueAction } from '@/lib/queue-api';
import {
  QueueEntry,
  QueueLane,
  getQueueScanPath,
  getLaneLabel,
  serviceLanes,
} from '@/lib/queue-store';
import { getRoleLabel, getRoleLane, readStationRole, type StationRole } from '@/lib/station-role';

export default function QueueManagementPage() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [stationRole, setStationRole] = useState<StationRole | null>(null);

  useEffect(() => {
    setStationRole(readStationRole());
    let isMounted = true;

    const syncQueue = async () => {
      try {
        const nextQueue = await fetchQueueEntries();
        if (isMounted) {
          setQueue(nextQueue);
        }
      } catch {
        if (isMounted) {
          setQueue([]);
        }
      }
    };

    void syncQueue();
    const poll = window.setInterval(() => {
      void syncQueue();
    }, 2500);

    return () => {
      isMounted = false;
      window.clearInterval(poll);
    };
  }, []);

  const generalQueue = useMemo(
    () =>
      queue.filter(
        (item) => item.status === 'waiting' && item.currentLane === 'GENERAL' && !item.priority
      ),
    [queue]
  );

  const priorityQueue = useMemo(
    () =>
      queue.filter(
        (item) => item.status === 'waiting' && item.currentLane === 'GENERAL' && item.priority
      ),
    [queue]
  );

  const completedQueue = useMemo(
    () => queue.filter((item) => item.status === 'completed').slice(-6).reverse(),
    [queue]
  );

  const roleLane = stationRole ? getRoleLane(stationRole) : null;
  const hasFullQueueAccess = !stationRole || stationRole === 'nurse' || stationRole === 'admin';
  const visibleServiceLanes = roleLane ? serviceLanes.filter((lane) => lane === roleLane) : serviceLanes;

  const getLaneWaiting = (lane: QueueLane) =>
    queue.filter((item) => item.currentLane === lane && item.status === 'waiting');

  const getLaneServing = (lane: QueueLane) =>
    queue.filter((item) => item.currentLane === lane && item.status === 'serving');

  const handleAcceptNext = async (lane: QueueLane) => {
    if (lane === 'GENERAL') {
      return;
    }

    const nextQueue = await postQueueAction({ action: 'accept_next', lane });
    setQueue(nextQueue);
  };

  const handleCallNext = async (lane: QueueLane) => {
    if (lane === 'GENERAL') {
      return;
    }

    const nextQueue = await postQueueAction({ action: 'call_next', lane });
    setQueue(nextQueue);
  };

  const handleFinishStep = async (queueId: string) => {
    const nextQueue = await postQueueAction({ action: 'finish_step', queueId });
    setQueue(nextQueue);
  };

  const handleAddReferral = async (queueId: string, lane: 'BLOOD TEST' | 'DRUG TEST' | 'XRAY') => {
    const nextQueue = await postQueueAction({ action: 'add_referral', queueId, lane });
    setQueue(nextQueue);
  };

  if (!hasFullQueueAccess && roleLane) {
    const lane = roleLane;
    const waiting = getLaneWaiting(lane);
    const serving = getLaneServing(lane);
    const nextUp = waiting[0] ?? null;

    return (
      <PageLayout>
        <div className="px-8 py-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">
              {getRoleLabel(stationRole!)}
              </p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">{lane} Queue</h1>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                Monitor the active patient, call the next queue number, and keep this station moving
                without the full clinic board.
              </p>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/queue-display" target="_blank">
                <MonitorPlay className="w-4 h-4" />
                Open Queue Display
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Now Serving
                  </p>
                  <p className="mt-3 text-4xl font-black text-primary">{serving.length}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Waiting
                  </p>
                  <p className="mt-3 text-4xl font-black">{waiting.length}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Next Queue
                  </p>
                  <p className="mt-3 text-3xl font-black">{nextUp?.queueNumber ?? 'None'}</p>
                </Card>
              </div>

              <Card className="p-6">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Station Controls
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">{lane}</h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleAcceptNext(lane)}
                    >
                      Accept Next
                    </Button>
                    <Button onClick={() => void handleCallNext(lane)}>
                      Call Next
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {serving.length > 0 ? (
                    serving.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                              Now Serving
                            </p>
                            <p className="mt-3 text-5xl font-black tracking-tight text-primary">
                              {item.queueNumber}
                            </p>
                            <p className="mt-3 text-xl font-semibold">{item.patientName}</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {item.serviceType} • Remaining: {item.pendingLanes.join(' → ') || 'None'}
                            </p>
                            <Link
                              href={getQueueScanPath(item.id)}
                              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
                            >
                              Open QR Context
                            </Link>
                          </div>

                          <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
                            {lane === 'DOCTOR' && item.serviceType === 'CHECK-UP' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleAddReferral(item.id, 'BLOOD TEST')}
                                >
                                  Add Blood Test
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleAddReferral(item.id, 'DRUG TEST')}
                                >
                                  Add Drug Test
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleAddReferral(item.id, 'XRAY')}
                                >
                                  Add Xray
                                </Button>
                              </>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleFinishStep(item.id)}
                            >
                              {item.pendingLanes.length > 1 ? 'Finish Step and Return to General' : 'Complete Queue'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                      No active patient is being served in {lane}.
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Waiting Queue
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{lane}</h2>
                </div>
                <div className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                  {waiting.length} patients
                </div>
              </div>

              <div className="max-h-[42rem] space-y-3 overflow-y-auto pr-1">
                {waiting.length > 0 ? (
                  waiting.map((item, index) => (
                    <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold">{item.queueNumber}</p>
                          <p className="mt-1 font-medium">{item.patientName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.serviceType} • Remaining: {item.pendingLanes.join(' → ')}
                          </p>
                        </div>
                        <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          #{index + 1}
                        </span>
                      </div>
                      <Link
                        href={getQueueScanPath(item.id)}
                        className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
                      >
                        Open QR Context
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No waiting patients in {lane}.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Queue Management</h1>
            <p className="mt-2 text-muted-foreground">
              {stationRole === 'admin'
                ? 'Admin can monitor every lane, review queue movement, and oversee the full clinic workflow from one board.'
                : hasFullQueueAccess
                  ? 'Pre-employment must complete all required stations, but patients can start at any available lab. Check-up starts with the doctor, and optional labs can be added after the consultation.'
                  : `${getRoleLabel(stationRole!)} only sees its assigned queue and currently serving patients.`}
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/queue-display" target="_blank">
              <MonitorPlay className="w-4 h-4" />
              Open Queue Display
            </Link>
          </Button>
        </div>

        <div className={hasFullQueueAccess ? 'grid gap-8 xl:grid-cols-[1.05fr_1.95fr]' : 'space-y-8'}>
          {hasFullQueueAccess && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-bold">
                {stationRole === 'admin' ? 'Registration Oversight' : 'Nurse Intake'}
              </h2>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Queue entries are now read directly from the database. Create or verify patients
                  from the nurse registration workflow so the live board stays in sync across all
                  stations and displays.
                </p>

                <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  <p className="mb-1 font-semibold text-foreground">Recommended workflow</p>
                  <p>
                    Use Patient Registration for walk-ins and self-registrations, then return here
                    to accept, call, and monitor the database-backed queue.
                  </p>
                </div>

                <Button asChild className="h-11 w-full">
                  <Link href="/staff/patient-registration">Open Patient Registration</Link>
                </Button>
              </div>
            </Card>
          )}

          <div className={hasFullQueueAccess ? 'space-y-8' : ''}>
            {hasFullQueueAccess && (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">PRIORITY LANE</h2>
                    <span className="text-xs font-semibold text-red-600">{priorityQueue.length} waiting</span>
                  </div>
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {priorityQueue.length > 0 ? (
                      priorityQueue.map((item) => (
                        <div key={item.id} className="rounded-xl border border-red-100 bg-red-50 p-4">
                          <p className="font-bold text-red-700">{item.queueNumber}</p>
                          <p className="font-medium">{item.patientName}</p>
                          <p className="text-xs text-muted-foreground">
                            Next: {item.pendingLanes[0] ?? 'Done'} • {item.serviceType}
                          </p>
                          <Link href={getQueueScanPath(item.id)} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                            Open QR Context
                          </Link>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No priority patients waiting.
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="p-5 md:col-span-1 xl:col-span-2">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">GENERAL</h2>
                    <span className="text-xs text-muted-foreground">{generalQueue.length} waiting</span>
                  </div>
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {generalQueue.length > 0 ? (
                      generalQueue.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
                          <div>
                            <p className="font-semibold">{item.queueNumber} • {item.patientName}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.serviceType} • Next: {item.pendingLanes[0] ?? 'Done'}
                            </p>
                            <Link href={getQueueScanPath(item.id)} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                              Open QR Context
                            </Link>
                          </div>
                          <span className="text-xs font-semibold text-sky-700">{getLaneLabel(item)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No patients in the general queue.
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            <div className={hasFullQueueAccess ? 'grid gap-6 md:grid-cols-2' : 'grid gap-6 xl:grid-cols-[1.15fr_0.85fr]'}>
              {visibleServiceLanes.map((lane) => {
                const waiting = getLaneWaiting(lane);
                const serving = getLaneServing(lane);

                return (
                  <div key={lane} className={hasFullQueueAccess ? '' : 'grid gap-6 xl:grid-cols-[1.1fr_0.9fr]'}>
                    <Card className="p-6">
                      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
                            {lane} Station
                          </p>
                          <h2 className="mt-2 text-3xl font-bold">{lane}</h2>
                          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                            Accepts patients from GENERAL. Priority patients for this lane are accepted first. Pre-employment patients may enter any unfinished station.
                          </p>
                        </div>
                        <div className="grid min-w-40 grid-cols-2 gap-3">
                          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Serving</p>
                            <p className="mt-2 text-3xl font-bold text-primary">{serving.length}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waiting</p>
                            <p className="mt-2 text-3xl font-bold">{waiting.length}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:max-w-md">
                        <Button
                          variant="outline"
                          onClick={() => void handleAcceptNext(lane)}
                        >
                          Accept Next
                        </Button>
                        <Button onClick={() => void handleCallNext(lane)}>
                          Call Next
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Now Serving
                          </p>
                          <div className="space-y-3">
                            {serving.length > 0 ? (
                              serving.map((item) => (
                                <div key={item.id} className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <p className="text-3xl font-bold text-primary">{item.queueNumber}</p>
                                      <p className="mt-1 text-lg font-medium">{item.patientName}</p>
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        {item.serviceType} • Remaining: {item.pendingLanes.join(' → ') || 'None'}
                                      </p>
                                      <Link href={getQueueScanPath(item.id)} className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
                                        Open QR Context
                                      </Link>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                                      {lane === 'DOCTOR' && item.serviceType === 'CHECK-UP' && (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void handleAddReferral(item.id, 'BLOOD TEST')}
                                          >
                                            Add Blood Test
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void handleAddReferral(item.id, 'DRUG TEST')}
                                          >
                                            Add Drug Test
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void handleAddReferral(item.id, 'XRAY')}
                                          >
                                            Add Xray
                                          </Button>
                                        </>
                                      )}

                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void handleFinishStep(item.id)}
                                      >
                                        {item.pendingLanes.length > 1 ? 'Finish Step and Return to General' : 'Complete Queue'}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                                No active patient in {lane}.
                              </div>
                            )}
                          </div>
                        </div>

                        {hasFullQueueAccess && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Waiting in {lane}
                            </p>
                            <div className="space-y-3">
                              {waiting.length > 0 ? (
                                waiting.map((item) => (
                                  <div key={item.id} className="rounded-xl bg-muted/50 p-4">
                                    <p className="font-semibold">{item.queueNumber} • {item.patientName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.serviceType} • Remaining: {item.pendingLanes.join(' → ')}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                                  No waiting patients in {lane}.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>

                    {!hasFullQueueAccess && (
                      <Card className="p-6">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Waiting in {lane}
                        </p>
                        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                          {waiting.length > 0 ? (
                            waiting.map((item) => (
                              <div key={item.id} className="rounded-xl bg-muted/50 p-4">
                                <p className="text-lg font-semibold">{item.queueNumber}</p>
                                <p className="mt-1 font-medium">{item.patientName}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {item.serviceType} • Remaining: {item.pendingLanes.join(' → ')}
                                </p>
                                <Link href={getQueueScanPath(item.id)} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                                  Open QR Context
                                </Link>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                              No waiting patients in {lane}.
                            </div>
                          )}
                        </div>
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>

            {hasFullQueueAccess && (
              <Card className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold">Recently Completed</h2>
                  <Link href="/queue-display" target="_blank" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                    View public display
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {completedQueue.length > 0 ? (
                    completedQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                        <div>
                          <p className="font-semibold">{item.queueNumber} • {item.patientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.serviceType} • Finished: {item.completedLanes.join(' → ')}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-accent">Completed</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                      Completed queue entries will appear here.
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
