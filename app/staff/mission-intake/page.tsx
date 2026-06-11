'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Search, TicketCheck } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type MasterlistBatch = {
  id: string;
  ape_event_id: string;
  company_name: string;
  source_filename: string | null;
  total_patients: number;
  generated_lab_orders: number;
  ape_events?: { name?: string | null; ape_code?: string | null; status?: string | null } | null;
};

type MasterlistPatient = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  age: string | null;
  gender: string | null;
  department: string | null;
  assigned_patient_id: string | null;
  assigned_lab_order_id: string | null;
  assigned_at: string | null;
  ape_lab_order_pool?: { lab_order_number?: string | null } | null;
};

type LabOrderOption = {
  id: string;
  lab_order_number: string;
  sequence_number: number;
};

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase!.auth.getSession();
  if (!session?.access_token) throw new Error('Missing authenticated session.');
  return session.access_token;
}

function patientName(patient: MasterlistPatient) {
  return [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ');
}

export default function MissionIntakePage() {
  const [batches, setBatches] = useState<MasterlistBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<MasterlistPatient[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedLabOrderId, setSelectedLabOrderId] = useState('');
  const [assignment, setAssignment] = useState<{
    patientId: string;
    queueEntryId: string;
    queueNumber: string;
    labOrderNumber: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [pageError, setPageError] = useState('');

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId]
  );

  const loadBatches = async () => {
    try {
      setIsLoading(true);
      setPageError('');
      const token = await getAccessToken();
      const response = await fetch('/api/staff/ape-masterlist/batches', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { batches?: MasterlistBatch[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load mission batches.');
      setBatches(payload.batches ?? []);
      setSelectedBatchId((current) => current || payload.batches?.[0]?.id || '');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load mission batches.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMasterlist = async () => {
    if (!selectedBatch) {
      setPatients([]);
      setLabOrders([]);
      return;
    }

    try {
      setPageError('');
      const token = await getAccessToken();
      const params = new URLSearchParams({
        apeEventId: selectedBatch.ape_event_id,
        companyName: selectedBatch.company_name,
      });
      if (query.trim()) params.set('query', query.trim());

      const response = await fetch(`/api/staff/ape-masterlist?${params.toString()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as {
        patients?: MasterlistPatient[];
        availableLabOrders?: LabOrderOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load masterlist.');
      setPatients(payload.patients ?? []);
      setLabOrders(payload.availableLabOrders ?? []);
      setSelectedLabOrderId((current) =>
        current && payload.availableLabOrders?.some((order) => order.id === current)
          ? current
          : payload.availableLabOrders?.[0]?.id || ''
      );
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load masterlist.');
    }
  };

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(() => {
    void loadMasterlist();
  }, [selectedBatchId]);

  const assignLabOrder = async () => {
    if (!selectedPatientId || !selectedLabOrderId) {
      setPageError('Select a patient and an available lab order first.');
      return;
    }

    try {
      setIsAssigning(true);
      setPageError('');
      setAssignment(null);
      const token = await getAccessToken();
      const response = await fetch('/api/staff/ape-masterlist/assign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          masterlistPatientId: selectedPatientId,
          labOrderPoolId: selectedLabOrderId,
        }),
      });
      const payload = (await response.json()) as {
        assignment?: {
          patientId: string;
          queueEntryId: string;
          queueNumber: string;
          labOrderNumber: string;
        };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to assign lab order.');
      setAssignment(payload.assignment ?? null);
      setSelectedPatientId('');
      await loadMasterlist();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to assign lab order.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link href="/staff/qr-scanner">Open QR Scanner</Link>
          </Button>
        </div>

        {pageError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {assignment && (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Assigned {assignment.labOrderNumber} to queue {assignment.queueNumber}.{' '}
            <Link className="font-bold underline" href={`/staff/patients/${encodeURIComponent(assignment.patientId)}`}>
              Open Patient Profile
            </Link>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-6">
            <h2 className="text-xl font-bold">Mission Batch</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose the company uploaded by admin.</p>
            <div className="mt-5 space-y-4">
              <select
                value={selectedBatchId}
                onChange={(event) => setSelectedBatchId(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Select batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.company_name} - {batch.ape_events?.name ?? 'APE'}
                  </option>
                ))}
              </select>
              {selectedBatch && (
                <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                  <p className="font-semibold">{selectedBatch.company_name}</p>
                  <p className="mt-1 text-muted-foreground">{selectedBatch.total_patients} patients</p>
                  <p className="text-muted-foreground">{selectedBatch.generated_lab_orders} generated lab orders</p>
                  <p className="text-muted-foreground">File: {selectedBatch.source_filename || 'N/A'}</p>
                </div>
              )}
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Available Lab Orders</p>
                <p className="mt-2 text-3xl font-black">{labOrders.length}</p>
                <p className="text-sm text-muted-foreground">Only unused LAB numbers appear in the dropdown.</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Patient Search and Assignment</h2>
                <p className="mt-1 text-sm text-muted-foreground">Search by name, department, course, or company field.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadMasterlist()} disabled={!selectedBatch}>
                Refresh
              </Button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void loadMasterlist();
                  }}
                  className="pl-10"
                  placeholder="Search patient name..."
                />
              </div>
              <Button type="button" onClick={() => void loadMasterlist()} disabled={!selectedBatch}>
                Search
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_15rem_auto]">
              <select
                value={selectedPatientId}
                onChange={(event) => setSelectedPatientId(event.target.value)}
                className="h-11 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Select patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id} disabled={Boolean(patient.assigned_lab_order_id)}>
                    {patientName(patient)} {patient.assigned_lab_order_id ? '(assigned)' : ''}
                  </option>
                ))}
              </select>
              <select
                value={selectedLabOrderId}
                onChange={(event) => setSelectedLabOrderId(event.target.value)}
                className="h-11 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Select LAB number</option>
                {labOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.lab_order_number}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={() => void assignLabOrder()} disabled={isAssigning || !selectedPatientId || !selectedLabOrderId}>
                <TicketCheck className="h-4 w-4" />
                {isAssigning ? 'Assigning...' : 'Assign'}
              </Button>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-4 py-3 text-left">Patient</th>
                    <th className="px-4 py-3 text-left">Details</th>
                    <th className="px-4 py-3 text-left">Lab Order</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr key={patient.id} className="border-t">
                      <td className="px-4 py-3 font-semibold">{patientName(patient)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {patient.gender || 'N/A'} | {patient.birth_date || patient.age || 'No birthdate'} | {patient.department || 'No department'}
                      </td>
                      <td className="px-4 py-3">{patient.ape_lab_order_pool?.lab_order_number || 'Unassigned'}</td>
                      <td className="px-4 py-3">
                        {patient.assigned_lab_order_id ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Assigned</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">Waiting</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!patients.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        {isLoading ? 'Loading masterlist...' : 'No patients found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
