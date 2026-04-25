'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLayout } from '@/components/layout/page-layout';
import { StatusBadge } from '@/components/common/status-badge';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type SpecimenRow = {
  id: string;
  labOrderId: string;
  visitId: string;
  patientId: string;
  patientName: string;
  orderNumber: string;
  specimenId: string;
  testName: string;
  lane: string;
  status: 'pending_collection' | 'collected' | 'processing' | 'completed' | 'rejected';
  collectedAt: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string;
  recollectionRequested: boolean;
  recollectionRequestedAt: string | null;
  lastScannedAt: string | null;
  testedBy: string;
  testedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const session = await supabase?.auth.getSession();
  return session?.data.session?.access_token ?? '';
}

function toBadgeStatus(status: SpecimenRow['status']) {
  switch (status) {
    case 'pending_collection':
      return 'pending';
    case 'collected':
    case 'processing':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'rejected':
      return 'critical';
  }
}

export default function SpecimenTrackingPage() {
  const [specimens, setSpecimens] = useState<SpecimenRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');

  const loadSpecimens = async (search = searchQuery) => {
    try {
      setIsLoading(true);
      setPageError('');
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const response = await fetch(
        `/api/staff/specimen-tracking${params.toString() ? `?${params.toString()}` : ''}`,
        {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const payload = (await response.json()) as { error?: string; specimens?: SpecimenRow[] };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load specimen tracking.');
      }

      setSpecimens(payload.specimens ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load specimen tracking.');
      setSpecimens([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSpecimens('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counters = useMemo(
    () => ({
      pending: specimens.filter((item) => item.status === 'pending_collection').length,
      processing: specimens.filter((item) => item.status === 'processing' || item.status === 'collected').length,
      completed: specimens.filter((item) => item.status === 'completed').length,
      rejected: specimens.filter((item) => item.status === 'rejected').length,
    }),
    [specimens]
  );

  const handleAction = async (
    row: SpecimenRow,
    action: 'collect' | 'start_processing' | 'complete' | 'request_recollect'
  ) => {
    try {
      setIsSaving(row.id);
      setPageError('');
      const token = await getAccessToken();
      const response = await fetch('/api/staff/specimen-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          itemId: row.id,
          action,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to update specimen.');
      }

      await loadSpecimens();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to update specimen.');
    } finally {
      setIsSaving(null);
    }
  };

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div>
          <h1 className="text-3xl font-bold">Specimen Tracking</h1>
          <p className="mt-2 text-muted-foreground">
            Review tested lab-order summaries and see who uploaded or completed the machine result.
          </p>
        </div>

        {pageError ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-orange-400 p-4">
            <p className="text-xs font-semibold text-muted-foreground">PENDING COLLECTION</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">{counters.pending}</p>
          </Card>
          <Card className="border-l-4 border-blue-400 p-4">
            <p className="text-xs font-semibold text-muted-foreground">PROCESSING</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{counters.processing}</p>
          </Card>
          <Card className="border-l-4 border-green-400 p-4">
            <p className="text-xs font-semibold text-muted-foreground">COMPLETED</p>
            <p className="mt-2 text-3xl font-bold text-green-600">{counters.completed}</p>
          </Card>
          <Card className="border-l-4 border-red-400 p-4">
            <p className="text-xs font-semibold text-muted-foreground">REJECTED</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{counters.rejected}</p>
          </Card>
        </div>

        <Card className="mt-8 p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search specimen, patient, order number, or test..."
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadSpecimens(searchQuery)}>
                Search
              </Button>
              <Button variant="outline" onClick={() => void loadSpecimens('')}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </Card>

        <Card className="mt-8 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Tested Summary</h2>
              <p className="text-sm text-muted-foreground">
                Each row is backed by lab-order records and machine result uploads.
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              {specimens.length} specimens
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border">
            <div className="max-h-[42rem] overflow-auto">
              <table className="w-full min-w-[74rem] text-sm">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Specimen</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Patient</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Test</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Lane</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tested By</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Timeline</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {specimens.length > 0 ? (
                    specimens.map((row) => (
                      <tr key={row.id} className="border-b border-border">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{row.specimenId}</p>
                          <p className="text-xs text-muted-foreground">{row.orderNumber || 'No lab order no.'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.patientName || 'Unknown patient'}</p>
                          <p className="text-xs text-muted-foreground">{row.patientId}</p>
                        </td>
                        <td className="px-4 py-3">{row.testName}</td>
                        <td className="px-4 py-3">{row.lane}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <StatusBadge status={toBadgeStatus(row.status)} />
                            {row.recollectionRequested ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Recollection requested
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.testedBy || 'Not uploaded yet'}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.testedAt ? new Date(row.testedAt).toLocaleString() : 'No machine result'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <p>Collected: {row.collectedAt ? new Date(row.collectedAt).toLocaleString() : 'Not yet'}</p>
                          <p>Processing: {row.processingStartedAt ? new Date(row.processingStartedAt).toLocaleString() : 'Not yet'}</p>
                          <p>Completed: {row.completedAt ? new Date(row.completedAt).toLocaleString() : 'Not yet'}</p>
                          {row.rejectionReason ? <p className="text-red-600">Reason: {row.rejectionReason}</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving === row.id || row.status !== 'pending_collection'}
                              onClick={() => void handleAction(row, 'collect')}
                            >
                              Collect
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                isSaving === row.id ||
                                !['collected', 'pending_collection'].includes(row.status)
                              }
                              onClick={() => void handleAction(row, 'start_processing')}
                            >
                              Process
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving === row.id || row.status === 'completed'}
                              onClick={() => void handleAction(row, 'complete')}
                            >
                              Complete
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving === row.id}
                              onClick={() => void handleAction(row, 'request_recollect')}
                            >
                              Recollect
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        {isLoading ? 'Loading specimen records...' : 'No specimen records matched the current search.'}
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
