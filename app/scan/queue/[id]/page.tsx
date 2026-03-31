'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BadgeCheck, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchQueueEntry } from '@/lib/queue-api';
import { QueueEntry } from '@/lib/queue-store';
import { getRoleLabel, readStationRole, resolveScanRedirect, type StationRole } from '@/lib/station-role';

export default function ScanQueuePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [stationRole, setStationRole] = useState<StationRole | null>(null);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    setStationRole(readStationRole());
  }, []);

  useEffect(() => {
    if (!params.id) {
      return;
    }

    let isMounted = true;
    fetchQueueEntry(params.id)
      .then((queueEntry) => {
        if (isMounted) {
          setQueue([queueEntry]);
        }
      })
      .catch(() => {
        if (isMounted) {
          setQueue([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  const entry = useMemo(() => queue[0] ?? null, [queue]);

  const redirectTarget = useMemo(
    () => (entry && stationRole ? resolveScanRedirect(stationRole, entry) : null),
    [entry, stationRole]
  );

  useEffect(() => {
    if (!redirectTarget || hasRedirected) {
      return;
    }

    setHasRedirected(true);
    router.replace(redirectTarget);
  }, [hasRedirected, redirectTarget, router]);

  if (!entry) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-background to-secondary p-6">
        <div className="mx-auto max-w-3xl pt-12">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold">Queue Entry Not Found</h1>
            <p className="mt-3 text-muted-foreground">
              The scanned QR code does not match an active queue entry in this browser session.
            </p>
            <Button asChild className="mt-6">
              <Link href="/staff/queue">Back to Queue Management</Link>
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  if (redirectTarget && !hasRedirected) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-background to-secondary p-6">
        <div className="mx-auto max-w-3xl pt-12">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold">Redirecting to Station Workflow</h1>
            <p className="mt-3 text-muted-foreground">
              QR matched queue <strong>{entry.queueNumber}</strong>. Redirecting <strong>{getRoleLabel(stationRole!)}</strong> to the correct page.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-secondary p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">QR Scan Resolved</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Active Visit Context</h1>
            <p className="mt-2 text-muted-foreground">
              Automatic redirect was not completed for the current station role, so this fallback context view is shown instead.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/staff/queue">Open Queue Manager</Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.3fr]">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Queue Number</p>
                <p className="mt-2 text-4xl font-black tracking-tight text-primary">{entry.queueNumber}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <QrCode className="h-7 w-7" />
              </div>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</p>
                <p className="mt-1 font-semibold">{entry.patientName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service Type</p>
                <p className="mt-1 font-semibold">{entry.serviceType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Lane</p>
                <p className="mt-1 font-semibold">{entry.currentLane}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Queue Status</p>
                <p className="mt-1 font-semibold">{entry.status}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</p>
                <p className="mt-1 font-semibold">{entry.priority ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <BadgeCheck className="h-6 w-6 text-primary" />
              <div>
                <h2 className="text-xl font-bold">Pending Workflow</h2>
                <p className="text-sm text-muted-foreground">
                  Use this view to identify the patient&apos;s active visit and pending station steps after scan.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <p className="font-semibold">Current Station Role</p>
              <p className="mt-1 text-muted-foreground">
                {stationRole ? getRoleLabel(stationRole) : 'No station role found. Login must set a role first.'}
              </p>
              {!redirectTarget && stationRole && (
                <p className="mt-2 text-muted-foreground">
                  No direct workflow matched this patient for the logged-in station.
                </p>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Steps</p>
                {entry.pendingLanes.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {entry.pendingLanes.map((lane) => (
                      <li key={lane} className="rounded-lg bg-background px-3 py-2 font-medium">
                        {lane}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No pending steps.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed Steps</p>
                {entry.completedLanes.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {entry.completedLanes.map((lane) => (
                      <li key={lane} className="rounded-lg bg-background px-3 py-2 font-medium">
                        {lane}
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
    </main>
  );
}
