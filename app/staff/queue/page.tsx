'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Clock3, ExternalLink, MonitorPlay, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageLayout } from '@/components/layout/page-layout';
import { fetchQueueEntries, postQueueAction, postQueueActionWithContext } from '@/lib/queue-api';
import {
  QueueEntry,
  QueueLane,
  getLaneLabel,
  getQueueVisitPath,
  getQueueWorkflowPath,
  serviceLanes,
} from '@/lib/queue-store';
import {
  getRoleLabel,
  getRoleLane,
  readStaffProfile,
  readStationRole,
  type StationRole,
} from '@/lib/station-role';

function QueueMeta({ item }: { item: QueueEntry }) {
  return (
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      {item.serviceType}
      {item.pendingLanes.length > 0
        ? ` | Remaining: ${item.pendingLanes.join(' -> ')}`
        : ' | No remaining steps'}
    </p>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  emphasized = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <Card className="min-w-0">
      <div className="flex min-h-[6rem] flex-col justify-between gap-3 px-5 py-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold leading-tight text-muted-foreground">{label}</p>
          <span className="shrink-0 text-muted-foreground">{icon}</span>
        </div>
        <p
          className={`text-center text-4xl font-black leading-none ${emphasized ? 'text-primary' : ''}`}
        >
          {value}
        </p>
      </div>
    </Card>
  );
}

function getEntryActionPath(entry: QueueEntry, lane?: QueueLane | null) {
  if (lane && lane !== 'GENERAL') {
    return getQueueWorkflowPath(entry.id, lane);
  }

  return getQueueVisitPath(entry.id);
}

function getEntryActionLabel(lane?: QueueLane | null) {
  if (lane && lane !== 'GENERAL') {
    return lane === 'DOCTOR' ? 'Open Consultation' : 'Open Station Task';
  }

  return 'Open Patient Visit';
}

export default function QueueManagementPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [stationRole, setStationRole] = useState<StationRole | null>(null);
  const [staffProfileId, setStaffProfileId] = useState<string | null>(null);

  useEffect(() => {
    setStationRole(readStationRole());
    setStaffProfileId(readStaffProfile()?.id ?? null);
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
    () => queue.filter((item) => item.status === 'completed').slice(-10).reverse(),
    [queue]
  );
  const missedQueue = useMemo(
    () => queue.filter((item) => item.status === 'missed').slice(-10).reverse(),
    [queue]
  );
  const requeueRequiredQueue = useMemo(
    () => queue.filter((item) => item.status === 'requeue_required').slice(-10).reverse(),
    [queue]
  );

  const servingCount = useMemo(
    () => queue.filter((item) => item.status === 'serving').length,
    [queue]
  );
  const waitingCount = useMemo(
    () => queue.filter((item) => item.status === 'waiting').length,
    [queue]
  );

  const roleLane = stationRole ? getRoleLane(stationRole) : null;
  const hasFullQueueAccess =
    !stationRole ||
    stationRole === 'nurse' ||
    stationRole === 'cashier' ||
    stationRole === 'admin';
  const visibleServiceLanes = roleLane ? serviceLanes.filter((lane) => lane === roleLane) : serviceLanes;

  const getLaneWaiting = (lane: QueueLane) =>
    queue.filter(
      (item) =>
        item.status === 'waiting' &&
        item.pendingLanes.includes(lane)
    );

  const getLaneServing = (lane: QueueLane) =>
    queue.filter(
      (item) =>
        item.currentLane === lane &&
        item.status === 'serving'
    );

  const handleCallNext = async (lane: QueueLane) => {
    if (lane === 'GENERAL') {
      return;
    }

    const payload = await postQueueActionWithContext({
      action: 'call_next',
      lane,
      actorStaffId: lane === 'DOCTOR' ? staffProfileId ?? undefined : undefined,
    });
    setQueue(payload.queue);

    if (payload.activatedQueueId) {
      router.push(getQueueWorkflowPath(payload.activatedQueueId, lane));
    }
  };

  const handleAddReferral = async (queueId: string, lane: 'BLOOD TEST' | 'DRUG TEST' | 'XRAY' | 'ECG') => {
    const nextQueue = await postQueueAction({ action: 'add_referral', queueId, lane });
    setQueue(nextQueue);
  };

  const handleQueueStatusAction = async (
    action: 'mark_missed' | 'requeue' | 'acknowledge_response',
    queueId: string
  ) => {
    const nextQueue = await postQueueAction({ action, queueId });
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
                Keep this station focused on active work. The serving patient stays prominent, and
                the waiting queue stays inside a scrollable panel.
              </p>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/queue-display" target="_blank">
                <MonitorPlay className="w-4 h-4" />
                Open Queue Display
              </Link>
            </Button>
          </div>

            <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="In Progress"
              value={serving.length}
              icon={<Activity className="h-4 w-4 text-primary" />}
              emphasized
            />
            <SummaryCard
              label="Waiting"
              value={waiting.length}
              icon={<Clock3 className="h-4 w-4 text-muted-foreground" />}
            />
            <SummaryCard
              label="Next Queue"
              value={nextUp?.queueNumber ?? 'None'}
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="p-6">
              <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Station Controls
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{lane}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Use one action only. `Call Next` automatically completes the current patient in this station and moves the next patient into in progress.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-1">
                  <Button onClick={() => void handleCallNext(lane)}>Call Next</Button>
                </div>
              </div>

              <div className="space-y-4">
                {serving.length > 0 ? (
                  serving.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                            In Progress
                          </p>
              <p className="mt-3 text-5xl font-black tracking-tight text-primary">
                            {item.queueNumber}
                          </p>
                          <p className="mt-3 text-xl font-semibold">{item.patientName}</p>
                          {lane === 'DOCTOR' && item.assignedDoctorName && (
                            <p className="mt-2 text-sm font-medium text-primary">
                              Assigned Doctor: {item.assignedDoctorName}
                            </p>
                          )}
                          <QueueMeta item={item} />
                          <Link
                            href={getEntryActionPath(item, lane)}
                            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
                          >
                            {getEntryActionLabel(lane)}
                          </Link>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
                          <Button
                            size="sm"
                            onClick={() => void handleQueueStatusAction('acknowledge_response', item.id)}
                          >
                            Patient Present
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleQueueStatusAction('mark_missed', item.id)}
                          >
                            Mark Missed
                          </Button>
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleAddReferral(item.id, 'ECG')}
                              >
                                Add ECG
                              </Button>
                            </>
                          )}
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

            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Waiting Queue
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{lane}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This list shows every patient who still has {lane} pending.
                  </p>
                </div>
                <div className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                  {waiting.length} patients
                </div>
              </div>

              <ScrollArea className="h-[42rem] pr-3">
                <div className="space-y-3">
                  {waiting.length > 0 ? (
                    waiting.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">{item.queueNumber}</p>
                            <p className="mt-1 font-medium">{item.patientName}</p>
                            {lane === 'DOCTOR' && item.assignedDoctorName && (
                              <p className="mt-1 text-xs font-medium text-primary">
                                Assigned Doctor: {item.assignedDoctorName}
                              </p>
                            )}
                            <QueueMeta item={item} />
                          </div>
                          <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            #{index + 1}
                          </span>
                        </div>
                        <Link
                          href={getEntryActionPath(item, lane)}
                          className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
                        >
                          {getEntryActionLabel(lane)}
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No waiting patients in {lane}.
                    </div>
                  )}
                </div>
              </ScrollArea>
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
                : stationRole === 'cashier'
                  ? 'Cashier / front desk can verify patients, start the live queue, and continue into billing from the same workspace.'
                : 'Pre-employment must complete all required stations, but patients can start at any available lab. Check-up starts with the doctor, and optional labs can be added after the consultation.'}
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/queue-display" target="_blank">
              <MonitorPlay className="w-4 h-4" />
              Open Queue Display
            </Link>
          </Button>
        </div>

        <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total Waiting"
                value={waitingCount}
                icon={<Clock3 className="h-4 w-4 text-muted-foreground" />}
              />
              <SummaryCard
                label="In Progress"
                value={servingCount}
                icon={<Activity className="h-4 w-4 text-primary" />}
                emphasized
              />
              <SummaryCard
                label="Re-Queue Required"
                value={requeueRequiredQueue.length}
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
              />
              <SummaryCard
                label="Missed"
                value={missedQueue.length}
                icon={<Users className="h-4 w-4 text-red-600" />}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold">PRIORITY LANE</h2>
                  <span className="text-xs font-semibold text-red-600">{priorityQueue.length} waiting</span>
                </div>
                <ScrollArea className="h-[28rem] pr-3">
                  <div className="space-y-3">
                    {priorityQueue.length > 0 ? (
                      priorityQueue.map((item) => (
                        <div key={item.id} className="rounded-xl border border-red-100 bg-red-50 p-4">
                          <p className="font-bold text-red-700">{item.queueNumber}</p>
                          <p className="font-medium">{item.patientName}</p>
                          <p className="text-xs text-muted-foreground">
                            Next: {item.pendingLanes[0] ?? 'Done'} | {item.serviceType}
                          </p>
                          <Link
                            href={getEntryActionPath(item)}
                            className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                          >
                            Open Patient Visit
                          </Link>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No priority patients waiting.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </Card>

              <Card className="p-5 md:col-span-1 xl:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold">GENERAL</h2>
                  <span className="text-xs text-muted-foreground">{generalQueue.length} waiting</span>
                </div>
                <ScrollArea className="h-[28rem] pr-3">
                  <div className="space-y-3">
                    {generalQueue.length > 0 ? (
                      generalQueue.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
                          <div>
                            <p className="font-semibold">{item.queueNumber} | {item.patientName}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.serviceType} | Next: {item.pendingLanes[0] ?? 'Done'}
                            </p>
                            {item.assignedDoctorName && (
                              <p className="mt-1 text-xs text-primary">
                                Assigned Doctor: {item.assignedDoctorName}
                              </p>
                            )}
                            <Link
                              href={getEntryActionPath(item)}
                              className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                            >
                              Open Patient Visit
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
                </ScrollArea>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {visibleServiceLanes.map((lane) => {
                const waiting = getLaneWaiting(lane);
                const serving = getLaneServing(lane);

                return (
                  <Card key={lane} className="p-6">
                    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="mt-2 text-3xl font-bold">{lane}</h2>
                      </div>
                      <div className="grid min-w-40 grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
                          <p className="text-sm font-semibold leading-tight text-muted-foreground">
                            In Progress
                          </p>
                          <p className="mt-1 text-3xl font-bold leading-none text-primary">{serving.length}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
                          <p className="text-sm font-semibold leading-tight text-muted-foreground">
                            Waiting
                          </p>
                          <p className="mt-1 text-3xl font-bold leading-none">{waiting.length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6 grid gap-3 sm:grid-cols-1 xl:max-w-xs">
                      <Button onClick={() => void handleCallNext(lane)}>Call Next</Button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          In Progress
                        </p>
                        <div className="space-y-3">
                          {serving.length > 0 ? (
                            serving.map((item) => (
                              <div key={item.id} className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <p className="text-3xl font-bold text-primary">{item.queueNumber}</p>
                                    <p className="mt-1 text-lg font-medium">{item.patientName}</p>
                                    {lane === 'DOCTOR' && item.assignedDoctorName && (
                                      <p className="mt-1 text-xs font-medium text-primary">
                                        Assigned Doctor: {item.assignedDoctorName}
                                      </p>
                                    )}
                                    <QueueMeta item={item} />
                                    <Link
                                      href={getEntryActionPath(item, lane)}
                                      className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
                                    >
                                      {getEntryActionLabel(lane)}
                                    </Link>
                                  </div>

                                  <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                                    <Button
                                      size="sm"
                                      onClick={() => void handleQueueStatusAction('acknowledge_response', item.id)}
                                    >
                                      Patient Present
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void handleQueueStatusAction('mark_missed', item.id)}
                                    >
                                      Mark Missed
                                    </Button>
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
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => void handleAddReferral(item.id, 'ECG')}
                                        >
                                          Add ECG
                                        </Button>
                                      </>
                                    )}
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
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Missed / Re-Queue</h2>
                <span className="text-xs font-semibold text-muted-foreground">
                  {missedQueue.length + requeueRequiredQueue.length} patients
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Re-Queue Required
                  </p>
                  <div className="space-y-3">
                    {requeueRequiredQueue.length > 0 ? (
                      requeueRequiredQueue.map((item) => (
                        <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="font-semibold">{item.queueNumber} | {item.patientName}</p>
                          <QueueMeta item={item} />
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            onClick={() => void handleQueueStatusAction('requeue', item.id)}
                          >
                            Re-Queue Patient
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No patients need re-queue right now.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Missed Calls
                  </p>
                  <div className="space-y-3">
                    {missedQueue.length > 0 ? (
                      missedQueue.map((item) => (
                        <div key={item.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
                          <p className="font-semibold">{item.queueNumber} | {item.patientName}</p>
                          <QueueMeta item={item} />
                          <p className="mt-3 text-sm text-muted-foreground">
                            Patient must re-queue from the check visit page or be re-queued by staff.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            onClick={() => void handleQueueStatusAction('requeue', item.id)}
                          >
                            Re-Queue
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No missed calls.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Recently Completed</h2>
                <Link
                  href="/queue-display"
                  target="_blank"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  View public display
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
              <ScrollArea className="h-[22rem] pr-3">
                <div className="space-y-3">
                  {completedQueue.length > 0 ? (
                    completedQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                        <div>
                          <p className="font-semibold">{item.queueNumber} | {item.patientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.serviceType} | Finished: {item.completedLanes.join(' -> ')}
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
              </ScrollArea>
            </Card>
        </div>
      </div>
    </PageLayout>
  );
}
