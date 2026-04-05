'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, CreditCard, Microscope, Search, ShieldCheck } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { readStationRole } from '@/lib/station-role';

type ActivityLogItem = {
  id: string;
  timestamp: string;
  category: 'queue' | 'results' | 'billing' | 'admin';
  title: string;
  detail: string;
  actor: string;
};

function getCategoryIcon(category: ActivityLogItem['category']) {
  switch (category) {
    case 'queue':
      return <Activity className="h-4 w-4" />;
    case 'results':
      return <Microscope className="h-4 w-4" />;
    case 'billing':
      return <CreditCard className="h-4 w-4" />;
    case 'admin':
      return <ShieldCheck className="h-4 w-4" />;
  }
}

function getCategoryBadge(category: ActivityLogItem['category']) {
  switch (category) {
    case 'queue':
      return 'bg-blue-100 text-blue-700';
    case 'results':
      return 'bg-emerald-100 text-emerald-700';
    case 'billing':
      return 'bg-amber-100 text-amber-700';
    case 'admin':
      return 'bg-violet-100 text-violet-700';
  }
}

export default function ActivityLogPage() {
  const [stationRole, setStationRole] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setStationRole(readStationRole());
  }, []);

  useEffect(() => {
    if (stationRole !== 'admin') {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadActivity = async () => {
      try {
        setPageError('');
        setIsLoading(true);

        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase!.auth.getSession();

        if (!session?.access_token) {
          throw new Error('Missing authenticated session.');
        }

        const response = await fetch('/api/staff/activity-log', {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const payload = (await response.json()) as {
          error?: string;
          items?: ActivityLogItem[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load activity log.');
        }

        if (!isMounted) {
          return;
        }

        setItems(payload.items ?? []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPageError(error instanceof Error ? error.message : 'Unable to load activity log.');
        setItems([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadActivity();

    return () => {
      isMounted = false;
    };
  }, [stationRole]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return items;
    }

    return items.filter((item) =>
      [item.title, item.detail, item.actor, item.category].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [items, searchQuery]);

  if (stationRole === null) {
    return null;
  }

  if (stationRole !== 'admin') {
    return (
      <PageLayout>
        <div className="px-8 py-8">
          <Card className="p-10 text-center">
            <h1 className="text-2xl font-bold">Admin Access Only</h1>
            <p className="mt-3 text-muted-foreground">
              The activity log is only available to the system administrator.
            </p>
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
              Admin Oversight
            </p>
            <h1 className="mt-2 text-3xl font-bold">Activity Log</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Review queue actions, result processing, billing events, and admin configuration changes from one audit-friendly timeline.
            </p>
          </div>
          <div className="rounded-full bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
            {filteredItems.length} entries
          </div>
        </div>

        <Card className="mt-8 p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, patient, actor, queue number, or category..."
              className="pl-10"
            />
          </div>

          <div className="mt-6 max-h-[64vh] space-y-3 overflow-y-auto pr-1">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 p-2 text-primary">
                          {getCategoryIcon(item.category)}
                        </span>
                        <p className="text-base font-semibold">{item.title}</p>
                        <Badge className={getCategoryBadge(item.category)}>{item.category}</Badge>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    <div className="text-sm text-muted-foreground lg:text-right">
                      <p className="font-medium text-foreground">{item.actor}</p>
                      <p>{new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                {isLoading
                  ? 'Loading activity log...'
                  : pageError || 'No activity log entries matched the current search.'}
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
