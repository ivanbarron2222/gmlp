'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchQueueEntries } from '@/lib/queue-api';
import { DisplayLane, QueueEntry } from '@/lib/queue-store';

const rightLanes: DisplayLane[] = ['BLOOD TEST', 'DRUG TEST', 'DOCTOR', 'XRAY'];

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function belongsToLane(item: QueueEntry, lane: DisplayLane) {
  if (lane === 'PRIORITY LANE') {
    return item.currentLane === 'GENERAL' && item.priority && item.status !== 'completed';
  }

  if (lane === 'GENERAL') {
    return item.currentLane === 'GENERAL' && !item.priority && item.status !== 'completed';
  }

  return item.currentLane === lane && item.status !== 'completed';
}

export default function QueueDisplayPage() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
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

    syncQueue();

    const poll = window.setInterval(() => {
      void syncQueue();
    }, 2000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);

    return () => {
      isMounted = false;
      window.clearInterval(poll);
      window.clearInterval(clockTimer);
    };
  }, []);

  const servingQueue = useMemo(
    () => queue.filter((item) => item.status === 'serving').slice(0, 4),
    [queue]
  );

  const getLaneItems = (lane: DisplayLane) => {
    const items = queue.filter((item) => belongsToLane(item, lane));
    return rightLanes.includes(lane as (typeof rightLanes)[number]) ? items.slice(0, 9) : items;
  };

  const generalItems = getLaneItems('GENERAL');
  const priorityItems = getLaneItems('PRIORITY LANE');

  const renderSideLane = (lane: DisplayLane) => {
    const items = getLaneItems(lane);
    const columns = rightLanes.includes(lane as (typeof rightLanes)[number]) ? 'grid-cols-3' : 'grid-cols-2';

    return (
      <section
        key={lane}
        className={`rounded-[1rem] border px-3 py-3 shadow-[0_16px_50px_rgba(15,23,42,0.08)] ${
          lane === 'PRIORITY LANE' ? 'border-red-200 bg-red-50/90' : 'border-sky-100 bg-white/95'
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{lane}</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              lane === 'PRIORITY LANE' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {items.length}
          </span>
        </div>

        {items.length > 0 ? (
          <div className={`grid ${columns} gap-2`}>
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl px-3 py-3 text-center font-black tracking-tight ${
                  item.status === 'serving' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-900'
                }`}
              >
                <span className="block text-[clamp(1.05rem,1.6vw,1.6rem)]">{item.queueNumber}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
            No queue
          </div>
        )}
      </section>
    );
  };

  return (
    <main className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#dff1ff_0%,#eef5fb_32%,#d9e8f7_100%)] text-slate-900">
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-sky-200/80 bg-white/90 px-6 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur lg:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-700">
              Globalife Medical Laboratory &amp; Polyclinic
            </p>
            <h1 className="mt-1 text-[clamp(1.7rem,2.1vw,2.8rem)] font-bold tracking-tight">Queue Display</h1>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Public Queue Monitor</p>
            <p className="mt-1 text-[clamp(1.35rem,1.8vw,2.4rem)] font-semibold">{formatClock(clock)}</p>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[0.92fr_2.7fr] lg:p-5">
          <section className="min-h-0 rounded-[1rem] border border-sky-100 bg-white/95 px-3 py-3 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <div className="grid h-full min-h-0 gap-4 md:grid-cols-2">
              <div className="min-h-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">GENERAL</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {generalItems.length} queues
                  </span>
                </div>

                {generalItems.length > 0 ? (
                  <div className="space-y-2">
                    {generalItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl px-3 py-3 font-black tracking-tight ${
                          item.status === 'serving' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        <span className="block text-[clamp(1.05rem,1.6vw,1.6rem)]">{item.queueNumber}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
                    No queue
                  </div>
                )}
              </div>

              <div className="min-h-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">PRIORITY LANE</h2>
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                    {priorityItems.length} queues
                  </span>
                </div>

                {priorityItems.length > 0 ? (
                  <div className="space-y-2">
                    {priorityItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl px-3 py-3 font-black tracking-tight ${
                          item.status === 'serving' ? 'bg-sky-100 text-sky-800' : 'bg-red-100 text-slate-900'
                        }`}
                      >
                        <span className="block text-[clamp(1.05rem,1.6vw,1.6rem)]">{item.queueNumber}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
                    No queue
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="min-h-0 rounded-[1.1rem] border border-sky-200/80 bg-white/95 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-700">Now Serving</p>
                <p className="mt-2 text-sm text-slate-500">Please proceed when your queue number is shown.</p>
              </div>
              <span className="mt-1 inline-flex h-3.5 w-3.5 rounded-full bg-red-500 animate-pulse" />
            </div>

            {servingQueue.length > 0 ? (
              <div className="grid gap-3 grid-cols-2">
                {servingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-h-[10rem] flex-col justify-center rounded-[1rem] border border-sky-100 bg-[linear-gradient(135deg,#fafdff_0%,#eaf4ff_100%)] px-4 py-4 text-center shadow-[0_14px_40px_rgba(14,116,144,0.12)]"
                  >
                    <p className="text-[clamp(0.75rem,1vw,1rem)] font-semibold uppercase tracking-[0.25em] text-sky-700">
                      {item.currentLane}
                    </p>
                    <p className="mt-3 text-[clamp(2.6rem,4vw,4.8rem)] font-black tracking-tight text-amber-500">
                      {item.queueNumber}
                    </p>
                    <p className="mt-3 text-[clamp(0.7rem,0.95vw,0.95rem)] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Please Proceed To: {item.currentLane}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[21rem] items-center justify-center rounded-[1rem] border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-lg text-slate-500">
                Waiting for the next patient to be called.
              </div>
            )}

            <div className="mt-4 rounded-[1rem] bg-slate-50/70">
              <div className="grid grid-cols-4 divide-x divide-slate-200">
                {rightLanes.map((lane) => {
                  const laneItems = getLaneItems(lane);

                  return (
                    <div key={lane} className="min-h-0 px-3 py-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-bold tracking-tight text-slate-900">{lane}</h2>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {laneItems.length} queues
                        </span>
                      </div>

                      {laneItems.length > 0 ? (
                        <div className="grid auto-rows-fr grid-cols-3 gap-2">
                          {laneItems.map((item) => (
                            <div
                              key={item.id}
                              className={`rounded-lg px-2 py-3 text-center font-black tracking-tight ${
                                item.status === 'serving' ? 'bg-sky-100 text-sky-800' : 'bg-white text-slate-900'
                              }`}
                            >
                              <span className="block text-[clamp(0.95rem,1.2vw,1.35rem)]">{item.queueNumber}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-slate-500">
                          No queue
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
