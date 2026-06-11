'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Camera, Printer, Upload, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageLayout } from '@/components/layout/page-layout';
import { fetchPendingRegistrations, PendingRegistration } from '@/lib/registration-store';
import { createPatientVisitRecord } from '@/lib/patient-records-store';
import { getQueueScanPath, getQueueVisitPath, QueueEntry } from '@/lib/queue-store';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const defaultFormData = {
  firstName: '',
  middleName: '',
  lastName: '',
  company: '',
  birthDate: '',
  gender: 'male',
  contactNumber: '',
  emailAddress: '',
  streetAddress: '',
  city: '',
  province: '',
  serviceNeeded: 'Check-Up',
  requestedLabService: '',
  selectedServiceCodes: [] as string[],
  assignedDoctorId: '',
  notes: '',
};

type DoctorOption = {
  id: string;
  fullName: string;
  email?: string;
  activeLoad: number;
  pendingConsultations: number;
  inProgressConsultations: number;
};

export default function PatientRegistrationPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [pageError, setPageError] = useState('');
  const [queuedEntry, setQueuedEntry] = useState<QueueEntry | null>(null);
  const [queuedLabNumbers, setQueuedLabNumbers] = useState<string[]>([]);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [companyMode, setCompanyMode] = useState<'select' | 'manual'>('select');
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [preferredDoctorId, setPreferredDoctorId] = useState<string | null>(null);
  const [preferredDoctorName, setPreferredDoctorName] = useState<string | null>(null);
  const [preferredDoctorReason, setPreferredDoctorReason] = useState<'history' | 'load_balanced' | null>(null);
  const [matchedPatientName, setMatchedPatientName] = useState<string | null>(null);
  const [patientMatchSource, setPatientMatchSource] = useState<
    'name_birthdate_contact' | 'name_birthdate' | 'email_birthdate' | null
  >(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraOpen(false);
  };

  const clearProfilePhoto = () => {
    if (profilePhotoPreview) {
      URL.revokeObjectURL(profilePhotoPreview);
    }
    setProfilePhoto(null);
    setProfilePhotoPreview('');
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
  }, [profilePhotoPreview]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!isCameraOpen || !video || !stream) return;

    video.srcObject = stream;
    void video.play().catch(() => undefined);

    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [isCameraOpen]);

  const preparePhoto = async (source: Blob) => {
    const image = document.createElement('img');
    const sourceUrl = URL.createObjectURL(source);
    image.src = sourceUrl;
    await image.decode();
    const maxSize = 720;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(sourceUrl);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to prepare profile photo.')), 'image/jpeg', 0.82)
    );
    clearProfilePhoto();
    const file = new File([blob], `patient-profile-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setProfilePhoto(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  };

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setPageError('Unable to open the camera. Check browser permission or upload a photo instead.');
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to capture profile photo.')), 'image/jpeg', 0.9)
    );
    await preparePhoto(blob);
    stopCamera();
  };

  const uploadProfilePhoto = async (patientId: string) => {
    if (!profilePhoto) return;
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase!.auth.getSession();
    if (!session?.access_token) throw new Error('Missing authenticated session for photo upload.');
    const photoForm = new FormData();
    photoForm.set('patientId', patientId);
    photoForm.set('photo', profilePhoto);
    const response = await fetch('/api/staff/patient-photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: photoForm,
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Unable to upload patient profile photo.');
  };

  useEffect(() => {
    fetchPendingRegistrations()
      .then((registrations) => setPendingRegistrations(registrations))
      .catch((error) =>
        setPageError(
          error instanceof Error ? error.message : 'Unable to load pending registrations.'
        )
      );
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/public/partner-companies', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load partner companies.');
        }

        return (await response.json()) as {
          companies?: Array<{ companyName?: string }>;
        };
      })
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        setCompanyOptions(
          (payload.companies ?? [])
            .map((company) => String(company.companyName ?? '').trim())
            .filter(Boolean)
        );
      })
      .catch(() => {
        if (isMounted) {
          setCompanyOptions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const requiresDoctorAssignment = formData.serviceNeeded === 'Check-Up';

  useEffect(() => {
    if (!requiresDoctorAssignment) {
      setDoctors([]);
      setPreferredDoctorId(null);
      setPreferredDoctorName(null);
      setPreferredDoctorReason(null);
      setMatchedPatientName(null);
      setPatientMatchSource(null);
      setFormData((current) =>
        current.assignedDoctorId ? { ...current, assignedDoctorId: '' } : current
      );
      return;
    }

    let isMounted = true;

    const loadDoctors = async () => {
      try {
        const params = new URLSearchParams();
        if (formData.firstName) params.set('firstName', formData.firstName);
        if (formData.lastName) params.set('lastName', formData.lastName);
        if (formData.birthDate) params.set('birthDate', formData.birthDate);
        if (formData.contactNumber) params.set('contactNumber', formData.contactNumber);
        if (formData.emailAddress) params.set('emailAddress', formData.emailAddress);

        const response = await fetch(`/api/staff/doctors?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          doctors?: DoctorOption[];
          preferredDoctorId?: string | null;
          preferredDoctorName?: string | null;
          preferredDoctorReason?: 'history' | 'load_balanced' | null;
          matchedPatientName?: string | null;
          patientMatchSource?: 'name_birthdate_contact' | 'name_birthdate' | 'email_birthdate' | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load doctors.');
        }

        if (!isMounted) {
          return;
        }

        setDoctors(payload.doctors ?? []);
        setPreferredDoctorId(payload.preferredDoctorId ?? null);
        setPreferredDoctorName(payload.preferredDoctorName ?? null);
        setPreferredDoctorReason(payload.preferredDoctorReason ?? null);
        setMatchedPatientName(payload.matchedPatientName ?? null);
        setPatientMatchSource(payload.patientMatchSource ?? null);

        if (payload.preferredDoctorId) {
          setFormData((current) =>
            current.assignedDoctorId
              ? current
              : { ...current, assignedDoctorId: payload.preferredDoctorId ?? '' }
          );
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDoctors([]);
        setPreferredDoctorId(null);
        setPreferredDoctorName(null);
        setPreferredDoctorReason(null);
        setMatchedPatientName(null);
        setPatientMatchSource(null);
        setPageError(error instanceof Error ? error.message : 'Unable to load doctors.');
      }
    };

    void loadDoctors();

    return () => {
      isMounted = false;
    };
  }, [
    requiresDoctorAssignment,
    formData.firstName,
    formData.lastName,
    formData.birthDate,
    formData.contactNumber,
    formData.emailAddress,
  ]);

  const selectedRegistration = useMemo(
    () => pendingRegistrations.find((item) => item.id === selectedRegistrationId) ?? null,
    [pendingRegistrations, selectedRegistrationId]
  );

  const isKnownCompany = useMemo(
    () => companyOptions.includes(formData.company),
    [companyOptions, formData.company]
  );

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      ...(name === 'serviceNeeded' && value !== 'Lab' ? { requestedLabService: '' } : {}),
      [name]: value,
    }));
  };

  const handleClear = () => {
    setFormData(defaultFormData);
    setCompanyMode('select');
    setSelectedRegistrationId(null);
    setVerificationMessage('');
    setQueuedEntry(null);
    setQueuedLabNumbers([]);
    setIsFormOpen(false);
    setPageError('');
    stopCamera();
    clearProfilePhoto();
  };

  const handleOpenManualForm = () => {
    setSelectedRegistrationId(null);
    setFormData(defaultFormData);
    setCompanyMode('select');
    setVerificationMessage('');
    stopCamera();
    clearProfilePhoto();
    setIsFormOpen(true);
  };

  const handleLoadRegistration = (registration: PendingRegistration) => {
    setSelectedRegistrationId(registration.id);
    setFormData({
      firstName: registration.firstName,
      middleName: registration.middleName,
      lastName: registration.lastName,
      company: registration.company,
      birthDate: registration.birthDate,
      gender: registration.gender,
      contactNumber: registration.contactNumber,
      emailAddress: registration.emailAddress,
      streetAddress: registration.streetAddress,
      city: registration.city,
      province: registration.province,
      serviceNeeded: registration.serviceNeeded,
      requestedLabService: registration.requestedLabService,
      selectedServiceCodes: registration.selectedServiceCodes,
      notes: registration.notes,
      assignedDoctorId: '',
    });
    setCompanyMode(
      registration.company && !companyOptions.includes(registration.company) ? 'manual' : 'select'
    );
    setVerificationMessage('');
    stopCamera();
    clearProfilePhoto();
    setIsFormOpen(true);
  };

  const handleCompanySelect = (value: string) => {
    if (value === '__manual__') {
      setCompanyMode('manual');
      setFormData((current) => ({
        ...current,
        company: isKnownCompany ? '' : current.company,
      }));
      return;
    }

    setCompanyMode('select');
    setFormData((current) => ({
      ...current,
      company: value,
    }));
  };

  const handleVerifyAndQueue = async () => {
    const fullName = [formData.firstName, formData.middleName, formData.lastName]
      .filter(Boolean)
      .join(' ');
    setPageError('');

    try {
      const response = await fetch('/api/staff/verify-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId: selectedRegistrationId,
          formData,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Unable to verify and queue patient.');
      }

      const payload = (await response.json()) as {
        patient: {
          id: string;
          firstName: string;
          middleName: string;
          lastName: string;
          company: string;
          birthDate: string;
          gender: string;
          contactNumber: string;
          emailAddress: string;
          streetAddress: string;
          city: string;
          province: string;
          notes: string;
        };
        queueEntry: QueueEntry;
        labNumbers: string[];
      };

      await uploadProfilePhoto(payload.patient.id);

      createPatientVisitRecord(
        {
          firstName: payload.patient.firstName,
          middleName: payload.patient.middleName,
          lastName: payload.patient.lastName,
          company: payload.patient.company,
          birthDate: payload.patient.birthDate,
          gender: payload.patient.gender,
          contactNumber: payload.patient.contactNumber,
          emailAddress: payload.patient.emailAddress,
          streetAddress: payload.patient.streetAddress,
          city: payload.patient.city,
          province: payload.patient.province,
          notes: payload.patient.notes,
          serviceNeeded: formData.serviceNeeded as 'Pre-Employment' | 'Check-Up' | 'Lab',
          requestedLabService: formData.requestedLabService,
        },
        payload.queueEntry
      );

      const registrations = await fetchPendingRegistrations();
      setPendingRegistrations(registrations);
      setVerificationMessage(`${fullName} has been verified and added to the queue.`);
      setQueuedEntry(payload.queueEntry);
      setQueuedLabNumbers(payload.labNumbers ?? []);
      setSelectedRegistrationId(null);
      setFormData(defaultFormData);
      clearProfilePhoto();
      setIsFormOpen(false);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : 'Unable to verify and queue patient.'
      );
    }
  };

  const handlePrintSlip = () => {
    if (!queuedEntry || typeof window === 'undefined') {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=420,height=720');

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Queue Slip ${queuedEntry.queueNumber}</title>
          <style>
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #0f172a;
            }
            .slip {
              border: 1px solid #cbd5e1;
              border-radius: 18px;
              padding: 24px;
              max-width: 340px;
              margin: 0 auto;
              text-align: center;
            }
            .brand {
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              color: #0b65b1;
            }
            .title {
              margin-top: 10px;
              font-size: 24px;
              font-weight: 700;
            }
            .queue {
              margin-top: 10px;
              font-size: 52px;
              font-weight: 900;
              color: #0b65b1;
              line-height: 1;
            }
            .meta {
              margin-top: 16px;
              font-size: 14px;
              line-height: 1.6;
              color: #475569;
            }
            .meta strong {
              color: #0f172a;
            }
            .note {
              margin-top: 14px;
              font-size: 12px;
              color: #64748b;
            }
            @page {
              size: auto;
              margin: 12mm;
            }
          </style>
        </head>
        <body>
          <div class="slip">
            <div class="brand">Globalife Medical Laboratory &amp; Polyclinic</div>
            <div class="title">Queue Slip</div>
            <div class="queue">${queuedEntry.queueNumber}</div>
            <div class="meta">
              <div><strong>${queuedEntry.patientName}</strong></div>
              <div>${queuedLabNumbers.length > 0 ? `Lab No: ${queuedLabNumbers.join(', ')}` : 'Lab No: N/A'}</div>
              <div>${queuedEntry.serviceType}${queuedEntry.requestedLabLane ? ` - ${queuedEntry.requestedLabLane}` : ''}</div>
              <div>${new Date(queuedEntry.createdAt).toLocaleString()}</div>
            </div>
            <div class="note">Present this queue number at the assigned station for staff processing.</div>
          </div>
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintRegisteredSlip = async (registration: PendingRegistration) => {
    const queueEntry = registration.queueEntry;
    if (!queueEntry || typeof window === 'undefined') {
      return;
    }

    const fullName = [registration.firstName, registration.middleName, registration.lastName]
      .filter(Boolean)
      .join(' ');
    const scanUrl = new URL(getQueueScanPath(queueEntry.id), window.location.origin).toString();
    const qrDataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 160 }).catch(() => '');
    const printWindow = window.open('', '_blank', 'width=420,height=760');

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Queue Slip ${queueEntry.queueNumber}</title>
          <style>
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #0f172a; }
            .slip { border: 1px solid #cbd5e1; border-radius: 18px; padding: 24px; max-width: 340px; margin: 0 auto; text-align: center; }
            .brand { font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #0b65b1; }
            .title { margin-top: 10px; font-size: 24px; font-weight: 700; }
            .queue { margin-top: 10px; font-size: 52px; font-weight: 900; color: #0b65b1; line-height: 1; }
            .meta { margin-top: 16px; font-size: 14px; line-height: 1.6; color: #475569; }
            .meta strong { color: #0f172a; }
            .qr { margin: 16px auto 0; width: 150px; height: 150px; }
            .note { margin-top: 14px; font-size: 12px; color: #64748b; }
            @page { size: auto; margin: 12mm; }
          </style>
        </head>
        <body>
          <div class="slip">
            <div class="brand">Globalife Medical Laboratory &amp; Polyclinic</div>
            <div class="title">Queue Slip</div>
            <div class="queue">${queueEntry.queueNumber}</div>
            <div class="meta">
              <div><strong>${fullName}</strong></div>
              <div>${registration.serviceNeeded}</div>
              <div>Pending: ${queueEntry.pendingLanes.join(', ') || 'N/A'}</div>
              <div>${new Date(queueEntry.createdAt).toLocaleString()}</div>
            </div>
            ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="Queue QR code" />` : ''}
            <div class="note">Scan QR to open the patient's active visit/profile.</div>
          </div>
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const formatServiceCode = (code: string) =>
    code
      .replace(/^svc-/i, '')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex justify-end">
          <Button onClick={handleOpenManualForm}>Open Registration Form</Button>
        </div>

        <Card className="mt-6 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Registered Patients Today</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                New `/register` submissions are automatically queued and appear here for slip printing.
              </p>
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {pendingRegistrations.length} registered
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-border">
            {pendingRegistrations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Queue</th>
                      <th className="px-4 py-3 font-semibold">Patient</th>
                      <th className="px-4 py-3 font-semibold">Service</th>
                      <th className="px-4 py-3 font-semibold">Tests / Stations</th>
                      <th className="px-4 py-3 font-semibold">Contact</th>
                      <th className="px-4 py-3 font-semibold">Registered</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {pendingRegistrations.map((registration) => {
                      const patientName = [registration.firstName, registration.middleName, registration.lastName]
                        .filter(Boolean)
                        .join(' ');
                      const tests =
                        registration.selectedServiceCodes.length > 0
                          ? registration.selectedServiceCodes.map(formatServiceCode).join(', ')
                          : registration.queueEntry?.pendingLanes.join(', ') || 'N/A';

                      return (
                        <tr key={registration.id} className="align-top hover:bg-muted/30">
                          <td className="px-4 py-4">
                            <p className="font-bold text-primary">
                              {registration.queueEntry?.queueNumber ?? 'Pending'}
                            </p>
                            {registration.registrationCode && (
                              <p className="mt-1 text-xs text-muted-foreground">{registration.registrationCode}</p>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-foreground">{patientName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {registration.company || 'No company'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              DOB: {registration.birthDate || 'N/A'}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-medium">{registration.serviceNeeded}</p>
                            {registration.requestedLabService && (
                              <p className="mt-1 text-xs text-muted-foreground">{registration.requestedLabService}</p>
                            )}
                          </td>
                          <td className="max-w-xs px-4 py-4 text-muted-foreground">
                            {tests}
                          </td>
                          <td className="px-4 py-4">
                            <p>{registration.contactNumber || 'N/A'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{registration.emailAddress || 'N/A'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[registration.city, registration.province].filter(Boolean).join(', ') || 'N/A'}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            {new Date(registration.submittedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              {registration.queueEntry ? (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => void handlePrintRegisteredSlip(registration)}>
                                    <Printer className="h-4 w-4" />
                                    Print
                                  </Button>
                                  <Button asChild size="sm" variant="outline">
                                    <Link href={getQueueVisitPath(registration.queueEntry.id)}>Open</Link>
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => handleLoadRegistration(registration)}>
                                  Load
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                No registered patients yet. New `/register` submissions will appear here.
              </div>
            )}
          </div>
        </Card>

        {pageError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {verificationMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {verificationMessage}
          </div>
        )}

        {queuedEntry && (
          <Card className="mt-8 border-primary/20 bg-primary/5 p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                  Patient Queued
                </p>
                <h2 className="mt-3 text-3xl font-bold">{queuedEntry.queueNumber}</h2>
                <p className="mt-2 text-base font-medium text-foreground">{queuedEntry.patientName}</p>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>
                    Service: <span className="font-medium text-foreground">{queuedEntry.serviceType}</span>
                  </p>
                  {queuedEntry.assignedDoctorName && (
                    <p>
                      Assigned Doctor:{' '}
                      <span className="font-medium text-foreground">{queuedEntry.assignedDoctorName}</span>
                    </p>
                  )}
                  <p>
                    Intake Lane: <span className="font-medium text-foreground">{queuedEntry.counter}</span>
                  </p>
                  <p>
                    Lab Number:{' '}
                    <span className="font-medium text-foreground">
                      {queuedLabNumbers.length > 0 ? queuedLabNumbers.join(', ') : 'N/A'}
                    </span>
                  </p>
                  <p>
                    Created:{' '}
                    <span className="font-medium text-foreground">
                      {new Date(queuedEntry.createdAt).toLocaleString()}
                    </span>
                  </p>
                  <p>
                    Visit Link:{' '}
                    <Link href={getQueueVisitPath(queuedEntry.id)} className="font-medium text-primary hover:underline">
                      Open patient visit
                    </Link>
                  </p>
                </div>
              </div>

              <div className="w-full max-w-xs rounded-2xl border bg-white p-5 shadow-md">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Queue Slip
                </p>
                <div className="mt-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Queue No.
                  </p>
                  <p className="mt-2 text-4xl font-bold text-primary">{queuedEntry.queueNumber}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {queuedLabNumbers.length > 0 ? `Lab No: ${queuedLabNumbers.join(', ')}` : 'Lab No: N/A'}
                  </p>
                </div>
                <Button className="mt-4 w-full gap-2" onClick={handlePrintSlip}>
                  <Printer className="h-4 w-4" />
                  Print Queue Slip
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0 sm:max-w-6xl">
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle className="text-2xl">Patient Verification Form</DialogTitle>
              <DialogDescription>
                {selectedRegistration
                  ? 'Review the submitted /register details, complete any missing fields, then verify and queue the patient.'
                  : 'Use the front desk intake form to register and queue a walk-in patient.'}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card className="p-6 shadow-sm">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <svg className="h-5 w-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold">Personal Information</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        FIRST NAME
                      </label>
                      <Input
                        name="firstName"
                        placeholder="e.g. Alexander"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        MIDDLE NAME
                      </label>
                      <Input
                        name="middleName"
                        placeholder="Optional"
                        value={formData.middleName}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        LAST NAME
                      </label>
                      <Input
                        name="lastName"
                        placeholder="e.g. Thompson"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        COMPANY
                      </label>
                      <select
                        value={companyMode === 'manual' ? '__manual__' : formData.company}
                        onChange={(event) => handleCompanySelect(event.target.value)}
                        className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-foreground"
                      >
                        <option value="">Select a company</option>
                        {companyOptions.map((company) => (
                          <option key={company} value={company}>
                            {company}
                          </option>
                        ))}
                        <option value="__manual__">Other / Type manually</option>
                      </select>
                      {companyMode === 'manual' && (
                        <Input
                          name="company"
                          placeholder="Company or employer"
                          value={formData.company}
                          onChange={handleInputChange}
                          className="mt-3 h-11"
                        />
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        BIRTHDATE
                      </label>
                      <Input
                        type="date"
                        name="birthDate"
                        value={formData.birthDate}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        GENDER
                      </label>
                      <select
                        name="gender"
                        value={formData.gender}
                        onChange={handleInputChange}
                        className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-foreground"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        SERVICE NEEDED
                      </label>
                      <select
                        name="serviceNeeded"
                        value={formData.serviceNeeded}
                        onChange={handleInputChange}
                        className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-foreground"
                      >
                        <option value="Pre-Employment">Pre-Employment</option>
                        <option value="Check-Up">Check-Up</option>
                        <option value="Lab">Lab</option>
                      </select>
                    </div>

                    {formData.serviceNeeded === 'Lab' && (
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                          LAB SERVICE
                        </label>
                        <select
                          name="requestedLabService"
                          value={formData.requestedLabService}
                          onChange={handleInputChange}
                          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-foreground"
                        >
                          <option value="">Select a lab service</option>
                          <option value="Blood Test">Blood Test</option>
                          <option value="Drug Test">Drug Test</option>
                          <option value="Xray">Xray</option>
                          <option value="ECG">ECG</option>
                        </select>
                      </div>
                    )}

                    {requiresDoctorAssignment && (
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                          ASSIGNED DOCTOR
                        </label>
                        <select
                          name="assignedDoctorId"
                          value={formData.assignedDoctorId}
                          onChange={handleInputChange}
                          className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-foreground"
                        >
                          <option value="">Select a doctor</option>
                          {doctors.map((doctor) => (
                            <option key={doctor.id} value={doctor.id}>
                              {doctor.fullName} ({doctor.activeLoad} active)
                            </option>
                          ))}
                        </select>
                        {preferredDoctorId && preferredDoctorName && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {preferredDoctorReason === 'history'
                              ? `Suggested based on previous doctor visit: ${preferredDoctorName}`
                              : `Auto-selected by current doctor workload: ${preferredDoctorName}`}
                          </p>
                        )}
                        {matchedPatientName && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Existing patient match found: {matchedPatientName}
                            {patientMatchSource === 'name_birthdate_contact'
                              ? ' using name, birthdate, and contact number.'
                              : patientMatchSource === 'email_birthdate'
                                ? ' using email address and birthdate.'
                                : ' using name and birthdate.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="p-6 shadow-sm">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                      <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold">Contact &amp; Address</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient Profile Photo</p>
                          <p className="mt-1 text-sm text-muted-foreground">Capture a camera photo or upload an existing image.</p>
                        </div>
                        {profilePhotoPreview && (
                          <Button type="button" variant="ghost" size="icon" onClick={clearProfilePhoto}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="mt-4 overflow-hidden rounded-xl border border-dashed border-border bg-background">
                        {isCameraOpen ? (
                          <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
                        ) : profilePhotoPreview ? (
                          <img src={profilePhotoPreview} alt="Patient profile preview" className="aspect-video w-full object-cover" />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">No profile photo selected.</div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {isCameraOpen ? (
                          <>
                            <Button type="button" size="sm" onClick={() => void capturePhoto()}>
                              <Camera className="mr-2 h-4 w-4" /> Capture Photo
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={stopCamera}>Cancel Camera</Button>
                          </>
                        ) : (
                          <Button type="button" variant="outline" size="sm" onClick={() => void startCamera()}>
                            <Camera className="mr-2 h-4 w-4" /> Open Camera
                          </Button>
                        )}
                        <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                          <Upload className="mr-2 h-4 w-4" /> Upload Photo
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void preparePhoto(file);
                              event.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        CONTACT NUMBER
                      </label>
                      <Input
                        name="contactNumber"
                        placeholder="+63912 345 6789"
                        value={formData.contactNumber}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        EMAIL ADDRESS
                      </label>
                      <Input
                        type="email"
                        name="emailAddress"
                        placeholder="patient@example.com"
                        value={formData.emailAddress}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        STREET ADDRESS
                      </label>
                      <Input
                        name="streetAddress"
                        placeholder="Street name, building, barangay"
                        value={formData.streetAddress}
                        onChange={handleInputChange}
                        className="h-11"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                          CITY
                        </label>
                        <Input
                          name="city"
                          placeholder="City"
                          value={formData.city}
                          onChange={handleInputChange}
                          className="h-11"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                          PROVINCE
                        </label>
                        <Input
                          name="province"
                          placeholder="Province"
                          value={formData.province}
                          onChange={handleInputChange}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                        NOTES
                      </label>
                      <Textarea
                        name="notes"
                        placeholder="Reception or nurse notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        className="min-h-24"
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
              <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs text-muted-foreground">
                  {selectedRegistration
                    ? `Loaded self-registration from ${new Date(selectedRegistration.submittedAt).toLocaleString()}`
                    : 'Manual front desk registration'}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleClear}>
                    Clear Form
                  </Button>
                  <Button className="px-8" onClick={handleVerifyAndQueue}>
                    Verify & Queue Patient
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}
