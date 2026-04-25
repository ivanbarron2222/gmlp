'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Copy, Download, QrCode, Search, UserRound, Wallet, FileSpreadsheet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageLayout } from '@/components/layout/page-layout';
import { getPublicAppUrl } from '@/lib/app-url';
import type { PatientRecord, VisitRecord } from '@/lib/patient-record-types';
import { generatePatientRecordsPdf } from '@/lib/patient-records-pdf';

type VisitTableRow = {
  visitId: string;
  queueEntryId: string;
  queueNumber: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  company: string;
  contactNumber: string;
  emailAddress: string;
  birthDate: string;
  gender: string;
  address: string;
  serviceType: string;
  requestedLabService: string;
  currentLane: string;
  visitStatus: VisitRecord['visitStatus'];
  pendingLanes: string[];
  completedLanes: string[];
  createdAt: string;
  updatedAt: string;
  billing: VisitRecord['billing'];
  machineResults: VisitRecord['machineResults'];
  timelineEvents: VisitRecord['timelineEvents'];
  labNumbers: string[];
  notes: string;
};

function getCompletionBadge(visitStatus: VisitRecord['visitStatus']) {
  return visitStatus === 'paid' || visitStatus === 'completed'
    ? {
        label: 'Complete',
        className: 'bg-emerald-100 text-emerald-700',
      }
    : {
        label: 'Pending',
        className: 'bg-amber-100 text-amber-700',
      };
}

function formatVisitStatus(visitStatus: VisitRecord['visitStatus']) {
  switch (visitStatus) {
    case 'in-progress':
      return 'In Progress';
    case 'awaiting-payment':
      return 'Awaiting Payment';
    default:
      return visitStatus.charAt(0).toUpperCase() + visitStatus.slice(1);
  }
}

export default function PatientRecordsPage() {
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [labServiceFilter, setLabServiceFilter] = useState('all');
  const [visitStatusFilter, setVisitStatusFilter] = useState('all');
  const [currentLaneFilter, setCurrentLaneFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [downloadingQueueId, setDownloadingQueueId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [visitQrDataUrl, setVisitQrDataUrl] = useState('');
  const [visitLinkCopied, setVisitLinkCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const queueId = new URLSearchParams(window.location.search).get('queueId');
    setSelectedQueueId(queueId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRecords = async () => {
      try {
        setPageError('');
        setIsLoading(true);

        const params = new URLSearchParams();
        if (startDate) {
          params.set('startDate', startDate);
        }
        if (endDate) {
          params.set('endDate', endDate);
        }

        const response = await fetch(
          `/api/staff/patient-records${params.toString() ? `?${params.toString()}` : ''}`,
          {
            cache: 'no-store',
          }
        );
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

        setRecords(payload.records ?? []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPageError(error instanceof Error ? error.message : 'Unable to load patient records.');
        setRecords([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadRecords();
    window.addEventListener('focus', loadRecords);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', loadRecords);
    };
  }, [startDate, endDate]);

  const handleDownloadPdf = async (queueId: string) => {
    try {
      setDownloadingQueueId(queueId);
      const response = await fetch(`/api/staff/report-download?queueId=${encodeURIComponent(queueId)}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; downloadUrl?: string }
        | null;

      if (!response.ok || !payload?.downloadUrl) {
        throw new Error(payload?.error ?? 'Released PDF is not available for this visit yet.');
      }

      window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : 'Released PDF is not available for this visit yet.'
      );
    } finally {
      setDownloadingQueueId(null);
    }
  };

  const handleExportRecordsPdf = async () => {
    try {
      setIsExportingPdf(true);

      const pdfBlob = await generatePatientRecordsPdf({
        rows: visitRows.map((visit) => ({
          queueNumber: visit.queueNumber,
          patientName: visit.patientName,
          patientCode: visit.patientCode,
          serviceType: visit.requestedLabService
            ? `${visit.serviceType} - ${visit.requestedLabService}`
            : visit.serviceType,
          currentLane: visit.currentLane,
          visitStatus: formatVisitStatus(visit.visitStatus),
          labNumber: visit.labNumbers.join(', ') || 'N/A',
          createdAt: new Date(visit.createdAt).toLocaleString('en-PH'),
        })),
        startDate,
        endDate,
      });

      const objectUrl = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      const dateLabel =
        startDate || endDate ? `${startDate || 'any'}_${endDate || 'any'}` : 'all-records';
      link.href = objectUrl;
      link.download = `patient-records-${dateLabel}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to export patient records PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const visitRows = useMemo<VisitTableRow[]>(() => {
    const query = searchQuery.trim().toLowerCase();

    return records
      .flatMap((patient) =>
        patient.visits.map((visit) => ({
          visitId: visit.id,
          queueEntryId: visit.queueEntryId,
          queueNumber: visit.queueNumber,
          patientId: patient.id,
          patientName: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
          patientCode: patient.id,
          company: patient.company,
          contactNumber: patient.contactNumber,
          emailAddress: patient.emailAddress,
          birthDate: patient.birthDate,
          gender: patient.gender,
          address: [patient.streetAddress, patient.city, patient.province].filter(Boolean).join(', '),
          serviceType: visit.serviceType,
          requestedLabService: visit.requestedLabService,
          currentLane: visit.currentLane,
          visitStatus: visit.visitStatus,
          pendingLanes: visit.pendingLanes,
          completedLanes: visit.completedLanes,
          createdAt: visit.createdAt,
          updatedAt: visit.updatedAt,
          billing: visit.billing,
          machineResults: visit.machineResults,
          timelineEvents: visit.timelineEvents,
          labNumbers: visit.labNumbers,
          notes: visit.notes,
        }))
      )
      .filter((row) => {
        if (!query) {
          return true;
        }

        return [
          row.patientName,
          row.patientCode,
          row.company,
          row.contactNumber,
          row.emailAddress,
          row.queueNumber,
          row.serviceType,
          row.requestedLabService,
          row.currentLane,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .filter((row) => serviceTypeFilter === 'all' || row.serviceType === serviceTypeFilter)
      .filter(
        (row) => labServiceFilter === 'all' || row.requestedLabService === labServiceFilter
      )
      .filter((row) => visitStatusFilter === 'all' || row.visitStatus === visitStatusFilter)
      .filter((row) => currentLaneFilter === 'all' || row.currentLane === currentLaneFilter)
      .filter((row) => companyFilter === 'all' || row.company === companyFilter)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [
    companyFilter,
    currentLaneFilter,
    labServiceFilter,
    records,
    searchQuery,
    serviceTypeFilter,
    visitStatusFilter,
  ]);

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .map((record) => record.company.trim())
            .filter((company) => company.length > 0)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [records]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setServiceTypeFilter('all');
    setLabServiceFilter('all');
    setVisitStatusFilter('all');
    setCurrentLaneFilter('all');
    setCompanyFilter('all');
  };

  useEffect(() => {
    if (visitRows.length === 0) {
      setSelectedVisitId(null);
      return;
    }

    if (selectedQueueId) {
      const matchedVisit = visitRows.find((visit) => visit.queueEntryId === selectedQueueId);
      if (matchedVisit) {
        setSelectedVisitId(matchedVisit.visitId);
        return;
      }
    }

    setSelectedVisitId((current) =>
      current && visitRows.some((visit) => visit.visitId === current) ? current : null
    );
  }, [selectedQueueId, visitRows]);

  const selectedVisit = visitRows.find((visit) => visit.visitId === selectedVisitId) ?? null;
  const selectedVisitLink = useMemo(() => {
    if (!selectedVisit?.queueEntryId) {
      return '';
    }

    const appUrl = getPublicAppUrl();

    if (!appUrl) {
      return '';
    }

    return `${appUrl}/staff/patient-records?queueId=${encodeURIComponent(selectedVisit.queueEntryId)}`;
  }, [selectedVisit?.queueEntryId]);
  const paidVisits = visitRows.filter((visit) => visit.billing?.paymentStatus === 'paid').length;
  const importedResults = visitRows.reduce((count, visit) => count + visit.machineResults.length, 0);

  useEffect(() => {
    setVisitLinkCopied(false);

    if (!selectedVisitLink) {
      setVisitQrDataUrl('');
      return;
    }

    let isMounted = true;

    QRCode.toDataURL(selectedVisitLink, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isMounted) {
          setVisitQrDataUrl(url);
        }
      })
      .catch(() => {
        if (isMounted) {
          setVisitQrDataUrl('');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedVisitLink]);

  const handleCopyVisitLink = async () => {
    if (!selectedVisitLink || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedVisitLink);
      setVisitLinkCopied(true);
    } catch {
      setVisitLinkCopied(false);
    }
  };

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
              View patient visit history in a simple records list, then open each record for full details.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="p-5 shadow-sm">
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

          <Card className="p-5 shadow-sm">
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

          <Card className="p-5 shadow-sm">
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

        <Card className="mt-8 p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_repeat(2,minmax(0,0.6fr))] xl:grid-cols-[1.4fr_repeat(6,minmax(0,0.7fr))]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, queue number, company, contact, service..."
                className="pl-10"
              />
            </div>

            <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Service Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                <SelectItem value="Pre-Employment">Pre-Employment</SelectItem>
                <SelectItem value="Check-Up">Check-Up</SelectItem>
                <SelectItem value="Lab">Lab</SelectItem>
              </SelectContent>
            </Select>

            <Select value={labServiceFilter} onValueChange={setLabServiceFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Lab Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lab Services</SelectItem>
                <SelectItem value="Blood Test">Blood Test</SelectItem>
                <SelectItem value="Drug Test">Drug Test</SelectItem>
                <SelectItem value="Xray">Xray</SelectItem>
                <SelectItem value="ECG">ECG</SelectItem>
              </SelectContent>
            </Select>

            <Select value={visitStatusFilter} onValueChange={setVisitStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Visit Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="awaiting-payment">Awaiting Payment</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={currentLaneFilter} onValueChange={setCurrentLaneFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Current Lane" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lanes</SelectItem>
                <SelectItem value="GENERAL">GENERAL</SelectItem>
                <SelectItem value="PRIORITY LANE">PRIORITY LANE</SelectItem>
                <SelectItem value="BLOOD TEST">BLOOD TEST</SelectItem>
                <SelectItem value="DRUG TEST">DRUG TEST</SelectItem>
                <SelectItem value="DOCTOR">DOCTOR</SelectItem>
                <SelectItem value="XRAY">XRAY</SelectItem>
                <SelectItem value="ECG">ECG</SelectItem>
              </SelectContent>
            </Select>

            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companyOptions.map((company) => (
                  <SelectItem key={company} value={company}>
                    {company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <div className="flex gap-2 xl:min-w-[15rem]">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <Button variant="outline" onClick={clearFilters}>
                Clear All
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-lg font-bold">Records List</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {visitRows.length} visits
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportRecordsPdf()}
                disabled={visitRows.length === 0 || isExportingPdf}
              >
                <Download className="mr-2 h-4 w-4" />
                {isExportingPdf ? 'Exporting...' : 'Export PDF'}
              </Button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="max-h-[42rem] overflow-auto">
              <table className="w-full min-w-[72rem] text-sm">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Queue</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Patient</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Service</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Current Lane</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Lab No.</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {visitRows.length > 0 ? (
                    visitRows.map((visit) => {
                      const completionBadge = getCompletionBadge(visit.visitStatus);

                      return (
                        <tr
                          key={visit.visitId}
                          onClick={() => setSelectedVisitId(visit.visitId)}
                          className="cursor-pointer border-b border-border bg-background transition-colors hover:bg-muted/40"
                        >
                          <td className="px-4 py-3 font-semibold">{visit.queueNumber}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium">{visit.patientName}</p>
                              <p className="text-xs text-muted-foreground">{visit.patientCode}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p>{visit.serviceType}</p>
                            {visit.requestedLabService && (
                              <p className="text-xs text-muted-foreground">{visit.requestedLabService}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">{visit.currentLane}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                                {formatVisitStatus(visit.visitStatus)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completionBadge.className}`}>
                                {completionBadge.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">{visit.labNumbers.length > 0 ? visit.labNumbers.join(', ') : 'N/A'}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(visit.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        {isLoading
                          ? 'Loading patient records...'
                          : pageError || 'No patient records matched the current filters.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Dialog open={Boolean(selectedVisit)} onOpenChange={(open) => !open && setSelectedVisitId(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            {selectedVisit ? (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedVisit.patientName}</DialogTitle>
                  <DialogDescription>
                    {selectedVisit.queueNumber} • {selectedVisit.serviceType}
                    {selectedVisit.requestedLabService ? ` • ${selectedVisit.requestedLabService}` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Patient Information
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="font-semibold">Patient ID:</span> {selectedVisit.patientCode}</p>
                      <p><span className="font-semibold">Birth Date:</span> {selectedVisit.birthDate}</p>
                      <p><span className="font-semibold">Gender:</span> {selectedVisit.gender}</p>
                      <p><span className="font-semibold">Contact:</span> {selectedVisit.contactNumber}</p>
                      <p><span className="font-semibold">Email:</span> {selectedVisit.emailAddress || 'N/A'}</p>
                      <p><span className="font-semibold">Company:</span> {selectedVisit.company || 'N/A'}</p>
                      <p><span className="font-semibold">Address:</span> {selectedVisit.address}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Visit Summary
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="font-semibold">Current Lane:</span> {selectedVisit.currentLane}</p>
                      <p><span className="font-semibold">Visit Status:</span> {formatVisitStatus(selectedVisit.visitStatus)}</p>
                      <p><span className="font-semibold">Lab Number:</span> {selectedVisit.labNumbers.join(', ') || 'N/A'}</p>
                      <p><span className="font-semibold">Created:</span> {new Date(selectedVisit.createdAt).toLocaleString()}</p>
                      <p><span className="font-semibold">Updated:</span> {new Date(selectedVisit.updatedAt).toLocaleString()}</p>
                      <p><span className="font-semibold">Pending Steps:</span> {selectedVisit.pendingLanes.join(', ') || 'None'}</p>
                      <p><span className="font-semibold">Completed Steps:</span> {selectedVisit.completedLanes.join(', ') || 'None'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Billing
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p>
                        <span className="font-semibold">Status:</span>{' '}
                        {selectedVisit.billing ? selectedVisit.billing.paymentStatus : 'No billing yet'}
                      </p>
                      <p>
                        <span className="font-semibold">Method:</span>{' '}
                        {selectedVisit.billing ? selectedVisit.billing.paymentMethod : 'N/A'}
                      </p>
                      <p>
                        <span className="font-semibold">Total:</span>{' '}
                        {selectedVisit.billing ? selectedVisit.billing.total : 'N/A'}
                      </p>
                      <p>
                        <span className="font-semibold">Paid At:</span>{' '}
                        {selectedVisit.billing?.paidAt
                          ? new Date(selectedVisit.billing.paidAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {selectedVisit.notes || 'No remarks saved for this visit.'}
                    </p>
                  </div>
                </div>

                {selectedVisit.queueEntryId && (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-5 w-5 text-primary" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Visit QR Access
                        </p>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Medtech can scan this QR code to open this patient visit directly in the patient records page.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedVisitLink ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={selectedVisitLink} target="_blank">
                              Open Visit Page
                            </Link>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            Open Visit Page
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopyVisitLink()}
                          disabled={!selectedVisitLink}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {visitLinkCopied ? 'Link Copied' : 'Copy Link'}
                        </Button>
                      </div>
                      <p className="mt-3 break-all text-xs text-muted-foreground">
                        {selectedVisitLink || 'Visit link will appear once the page URL is ready.'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-white p-3">
                        {visitQrDataUrl ? (
                          <img
                            src={visitQrDataUrl}
                            alt={`QR code for ${selectedVisit.patientName}`}
                            className="h-52 w-52 rounded-lg"
                          />
                        ) : (
                          <div className="flex h-52 w-52 items-center justify-center text-center text-sm text-muted-foreground">
                            QR preview unavailable.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedVisit.timelineEvents.length > 0 && (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Timeline
                    </p>
                    <div className="mt-4 space-y-3">
                      {selectedVisit.timelineEvents.map((event) => (
                        <div key={event.id} className="rounded-xl border border-border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{event.title}</p>
                            <span className="text-xs text-muted-foreground">
                              {new Date(event.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {event.detail ? (
                            <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedVisit.machineResults.length > 0 && (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Imported Machine Results
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {selectedVisit.machineResults.map((result) => (
                        <div key={result.id} className="rounded-xl border border-border bg-muted/20 p-4">
                          <p className="font-semibold">{result.lane}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{result.testName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Order: {result.orderId || 'N/A'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {result.results.length} analytes • {new Date(result.importedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedVisit.queueEntryId && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/staff/result-release?queueId=${encodeURIComponent(selectedVisit.queueEntryId)}`}>
                        Open Result Release
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/report/${encodeURIComponent(selectedVisit.queueEntryId)}`} target="_blank">
                        View Soft Copy
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDownloadPdf(selectedVisit.queueEntryId)}
                      disabled={downloadingQueueId === selectedVisit.queueEntryId}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {downloadingQueueId === selectedVisit.queueEntryId ? 'Preparing PDF...' : 'Open PDF'}
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}
