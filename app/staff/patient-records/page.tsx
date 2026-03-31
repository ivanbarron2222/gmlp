'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserRound, Wallet, FileSpreadsheet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import type { PatientRecord } from '@/lib/patient-record-types';

export default function PatientRecordsPage() {
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRecords = async () => {
      try {
        setPageError('');
        setIsLoading(true);

        const response = await fetch('/api/staff/patient-records', {
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          error?: string;
          records?: PatientRecord[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load patient records.');
        }

        if (!isMounted) {
          return;
        }

        const nextRecords = payload.records ?? [];
        setRecords(nextRecords);
        setSelectedPatientId((current) =>
          current && nextRecords.some((patient) => patient.id === current)
            ? current
            : nextRecords[0]?.id ?? null
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPageError(error instanceof Error ? error.message : 'Unable to load patient records.');
        setRecords([]);
        setSelectedPatientId(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadRecords();
    window.addEventListener('focus', loadRecords);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', loadRecords);
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return records;
    }

    return records.filter((patient) => {
      const fullName = [patient.firstName, patient.middleName, patient.lastName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        fullName.includes(query) ||
        patient.company.toLowerCase().includes(query) ||
        patient.contactNumber.toLowerCase().includes(query) ||
        patient.emailAddress.toLowerCase().includes(query) ||
        patient.city.toLowerCase().includes(query)
      );
    });
  }, [records, searchQuery]);

  const selectedPatient =
    filteredRecords.find((patient) => patient.id === selectedPatientId) ??
    filteredRecords[0] ??
    null;

  const totalVisits = records.reduce((count, patient) => count + patient.visits.length, 0);
  const paidVisits = records.reduce(
    (count, patient) =>
      count + patient.visits.filter((visit) => visit.billing?.paymentStatus === 'paid').length,
    0
  );
  const importedResults = records.reduce(
    (count, patient) =>
      count + patient.visits.reduce((sum, visit) => sum + visit.machineResults.length, 0),
    0
  );

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
              Patient Management
            </p>
            <h1 className="mt-2 text-3xl font-bold">Patient Records</h1>
            <p className="mt-2 text-muted-foreground">
              Review patient demographics, visit history, billing status, and imported machine
              results from one management workspace.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Patients
                </p>
                <p className="mt-1 text-3xl font-bold">{records.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paid Visits
                </p>
                <p className="mt-1 text-3xl font-bold">{paidVisits}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Imported Results
                </p>
                <p className="mt-1 text-3xl font-bold">{importedResults}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <Card className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient name, company, contact, email, city..."
                className="pl-10"
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-lg font-bold">Patient Directory</h2>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {filteredRecords.length} records
              </span>
            </div>

            <div className="mt-4 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((patient) => {
                  const fullName = [patient.firstName, patient.middleName, patient.lastName]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => setSelectedPatientId(patient.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        selectedPatient?.id === patient.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{fullName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {patient.contactNumber}
                          </p>
                          {patient.company && (
                            <p className="mt-1 text-xs text-muted-foreground">{patient.company}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {patient.city}, {patient.province}
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          {patient.visits.length} visits
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  {isLoading
                    ? 'Loading patient records...'
                    : pageError || 'No patient records matched the current search.'}
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            {selectedPatient ? (
              <>
                <Card className="p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Selected Patient
                      </p>
                      <h2 className="mt-2 text-3xl font-bold">
                        {[selectedPatient.firstName, selectedPatient.middleName, selectedPatient.lastName]
                          .filter(Boolean)
                          .join(' ')}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedPatient.birthDate} - {selectedPatient.gender} -{' '}
                        {selectedPatient.contactNumber}
                      </p>
                      {selectedPatient.company && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Company: {selectedPatient.company}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedPatient.emailAddress}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedPatient.streetAddress}, {selectedPatient.city},{' '}
                        {selectedPatient.province}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Visits
                        </p>
                        <p className="mt-2 text-3xl font-bold">{selectedPatient.visits.length}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Active Billing
                        </p>
                        <p className="mt-2 text-3xl font-bold">
                          {selectedPatient.visits.filter((visit) => visit.billing).length}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Visit History</h2>
                    <span className="text-sm text-muted-foreground">
                      {totalVisits} total visits in system
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {selectedPatient.visits.map((visit) => (
                      <div
                        key={visit.id}
                        className="rounded-2xl border border-border bg-muted/20 p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex items-center gap-3">
                              <p className="text-xl font-bold">{visit.queueNumber}</p>
                              <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
                                {visit.visitStatus}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {visit.serviceType}
                              {visit.requestedLabService ? ` - ${visit.requestedLabService}` : ''}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Created {new Date(visit.createdAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[20rem]">
                            <div className="rounded-xl border border-border bg-background p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Current Lane
                              </p>
                              <p className="mt-2 font-semibold">{visit.currentLane}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-background p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Billing
                              </p>
                              <p className="mt-2 font-semibold">
                                {visit.billing
                                  ? `${visit.billing.paymentStatus} - ${visit.billing.paymentMethod}`
                                  : 'No billing yet'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 xl:grid-cols-2">
                          <div className="rounded-xl border border-border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Pending Steps
                            </p>
                            <p className="mt-2 text-sm font-medium">
                              {visit.pendingLanes.join(', ') || 'None'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Completed Steps
                            </p>
                            <p className="mt-2 text-sm font-medium">
                              {visit.completedLanes.join(', ') || 'None'}
                            </p>
                          </div>
                        </div>

                        {visit.machineResults.length > 0 && (
                          <div className="mt-5 rounded-xl border border-border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Imported Machine Results
                            </p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              {visit.machineResults.map((result) => (
                                <div
                                  key={result.id}
                                  className="rounded-xl border border-border bg-muted/20 p-4"
                                >
                                  <p className="font-semibold">{result.lane}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {result.testName}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Order: {result.orderId || 'N/A'}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {result.results.length} analytes -{' '}
                                    {new Date(result.importedAt).toLocaleString()}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 flex justify-end">
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                disabled={!visit.queueEntryId}
                              >
                                <Link
                                  href={`/staff/result-release?queueId=${encodeURIComponent(
                                    visit.queueEntryId
                                  )}`}
                                >
                                  Open Result Release
                                </Link>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            ) : (
              <Card className="p-10 text-center text-muted-foreground">
                {isLoading
                  ? 'Loading patient records...'
                  : pageError
                    ? pageError
                    : 'Select a patient record from the directory to view details.'}
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
