'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, CheckCircle2, Printer, QrCode } from 'lucide-react';
import {
  addPendingRegistration,
  PendingRegistration,
  RegistrationFormInput,
  RegistrationService,
  RequestedLabService,
} from '@/lib/registration-store';

type PublicLabService = {
  code: string;
  name: string;
  category: string;
  amount: number;
  serviceLane: string | null;
};

type PublicPartnerCompany = {
  id: string;
  companyName: string;
  requirements?: Record<string, string[]>;
};

export default function PatientRegistrationPage() {
  const [companyOptions, setCompanyOptions] = useState<PublicPartnerCompany[]>([]);
  const [labServices, setLabServices] = useState<PublicLabService[]>([]);
  const [companyMode, setCompanyMode] = useState<'select' | 'manual'>('select');
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    company: '',
    birthDate: '',
    gender: '',
    contactNumber: '',
    emailAddress: '',
    streetAddress: '',
    city: '',
    province: '',
    serviceNeeded: '',
    requestedLabService: '',
    selectedServiceCodes: [] as string[],
    notes: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedRegistration, setSubmittedRegistration] = useState<PendingRegistration | null>(null);
  const [queueQrDataUrl, setQueueQrDataUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let isMounted = true;

    fetch('/api/public/partner-companies', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load partner companies.');
        }

        return (await response.json()) as {
          companies?: Array<{
            id?: string;
            companyName?: string;
            requirements?: Record<string, string[]>;
          }>;
        };
      })
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        const nextOptions = (payload.companies ?? [])
          .map((company) => ({
            id: String(company.id ?? ''),
            companyName: String(company.companyName ?? '').trim(),
            requirements: company.requirements ?? {},
          }))
          .filter((company) => company.id && company.companyName);

        setCompanyOptions(nextOptions);
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

  useEffect(() => {
    let isMounted = true;

    fetch('/api/public/service-catalog', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load lab services.');
        }

        return (await response.json()) as { labServices?: PublicLabService[] };
      })
      .then((payload) => {
        if (isMounted) {
          setLabServices(payload.labServices ?? []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLabServices([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name !== 'serviceNeeded') {
        return {
          ...prev,
          [name]: value,
        };
      }

      const company = companyOptions.find((option) => option.companyName === prev.company);
      const requirements =
        value === 'Pre-Employment'
          ? company?.requirements?.['pre-employment'] ?? []
          : value === 'Lab'
            ? company?.requirements?.lab ?? []
            : [];

      return {
        ...prev,
        serviceNeeded: value,
        requestedLabService: value === 'Lab' ? prev.requestedLabService : '',
        selectedServiceCodes: requirements,
      };
    });
  };

  const handleGenderSelect = (gender: string) => {
    setFormData((prev) => ({
      ...prev,
      gender,
    }));
  };

  const isKnownCompany = useMemo(
    () => companyOptions.some((company) => company.companyName === formData.company),
    [companyOptions, formData.company]
  );

  const selectedCompany = useMemo(
    () => companyOptions.find((company) => company.companyName === formData.company) ?? null,
    [companyOptions, formData.company]
  );

  const selectedLabServices = useMemo(
    () => labServices.filter((service) => formData.selectedServiceCodes.includes(service.code)),
    [formData.selectedServiceCodes, labServices]
  );

  const getRequestedLabServiceFromCodes = (serviceCodes: string[]) => {
    const primaryService = labServices.find((service) => serviceCodes.includes(service.code));

    return primaryService?.serviceLane === 'drug_test'
      ? 'Drug Test'
      : primaryService?.serviceLane === 'xray'
        ? 'Xray'
        : primaryService?.serviceLane === 'ecg'
          ? 'ECG'
          : serviceCodes.length > 0
            ? 'Blood Test'
            : '';
  };

  useEffect(() => {
    if (!selectedCompany || formData.serviceNeeded === 'Check-Up') {
      return;
    }

    const requirements =
      formData.serviceNeeded === 'Pre-Employment'
        ? selectedCompany.requirements?.['pre-employment'] ?? []
        : formData.serviceNeeded === 'Lab'
          ? selectedCompany.requirements?.lab ?? []
          : [];

    if (!requirements.length) {
      return;
    }

    setFormData((prev) => {
      const alreadySelected =
        requirements.length === prev.selectedServiceCodes.length &&
        requirements.every((code) => prev.selectedServiceCodes.includes(code));

      return alreadySelected
        ? prev
        : {
            ...prev,
            selectedServiceCodes: requirements,
            requestedLabService:
              prev.serviceNeeded === 'Lab'
                ? getRequestedLabServiceFromCodes(requirements)
                : prev.requestedLabService,
          };
    });
  }, [formData.serviceNeeded, labServices, selectedCompany]);

  const handleCompanySelect = (value: string) => {
    if (value === '__manual__') {
      setCompanyMode('manual');
      setFormData((prev) => ({
        ...prev,
        company: isKnownCompany ? '' : prev.company,
        selectedServiceCodes: prev.serviceNeeded === 'Pre-Employment' ? [] : prev.selectedServiceCodes,
      }));
      return;
    }

    const company = companyOptions.find((option) => option.companyName === value);
    const requirements =
      formData.serviceNeeded === 'Pre-Employment'
        ? company?.requirements?.['pre-employment'] ?? []
        : formData.serviceNeeded === 'Lab'
          ? company?.requirements?.lab ?? []
          : [];

    setCompanyMode('select');
    setFormData((prev) => ({
      ...prev,
      company: value,
      selectedServiceCodes: requirements.length > 0 ? requirements : prev.selectedServiceCodes,
    }));
  };

  const handleLabServiceToggle = (serviceCode: string, checked: boolean) => {
    setFormData((prev) => {
      const selectedServiceCodes = checked
        ? Array.from(new Set([...prev.selectedServiceCodes, serviceCode]))
        : prev.selectedServiceCodes.filter((code) => code !== serviceCode);

      return {
        ...prev,
        selectedServiceCodes,
        requestedLabService: getRequestedLabServiceFromCodes(selectedServiceCodes),
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSubmitError('');

    try {
      if (
        (formData.serviceNeeded === 'Lab' || formData.serviceNeeded === 'Pre-Employment') &&
        formData.selectedServiceCodes.length === 0
      ) {
        throw new Error('Please select at least one lab test.');
      }

      const registration = await addPendingRegistration({
        ...formData,
        gender: formData.gender.toLowerCase(),
        serviceNeeded: formData.serviceNeeded as RegistrationService,
        requestedLabService:
          formData.serviceNeeded === 'Lab'
            ? (formData.requestedLabService as RequestedLabService | '')
            : '',
        selectedServiceCodes: formData.selectedServiceCodes,
      } as RegistrationFormInput);
      setSubmittedRegistration(registration);
      setIsSubmitted(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to submit registration right now.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fullName = [formData.firstName, formData.middleName, formData.lastName]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    const queueId = submittedRegistration?.queueEntry?.id;
    if (!queueId || typeof window === 'undefined') {
      setQueueQrDataUrl('');
      return;
    }

    const scanUrl = new URL(`/scan/queue/${queueId}`, window.location.origin).toString();
    QRCode.toDataURL(scanUrl, { margin: 1, width: 160 })
      .then((dataUrl) => setQueueQrDataUrl(dataUrl))
      .catch(() => setQueueQrDataUrl(''));
  }, [submittedRegistration?.queueEntry?.id]);

  if (isSubmitted) {
    const queueEntry = submittedRegistration?.queueEntry;
    const submittedAt = submittedRegistration?.submittedAt
      ? new Date(submittedRegistration.submittedAt).toLocaleString()
      : new Date().toLocaleString();

    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-2xl">
          <div className="p-8 sm:p-10 text-center">
            <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-accent" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent mb-3">
              Thank You
            </p>
            <h1 className="text-3xl font-bold mb-3 sm:text-4xl">Registration Complete</h1>
            <p className="text-sm text-muted-foreground mb-8 sm:text-base">
              Your queue slip has been generated. Please wait for your queue number to be called.
            </p>

            <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 text-left text-sm mb-6 print:border-foreground print:bg-white">
              <div className="mb-4 rounded-lg border border-accent/30 bg-background p-4 text-center print:border-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Registration Slip
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight text-primary print:text-foreground">
                  {queueEntry?.queueNumber ?? submittedRegistration?.registrationCode ?? 'Pending'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{submittedAt}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-semibold text-accent mb-3 print:text-foreground">Queue Details</p>
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <p>Name: <span className="font-medium text-foreground">{fullName}</span></p>
                    <p>Company: <span className="font-medium text-foreground">{formData.company || 'N/A'}</span></p>
                    <p>Service: <span className="font-medium text-foreground">{queueEntry?.serviceType ?? formData.serviceNeeded}</span></p>
                    <p>Station: <span className="font-medium text-foreground">{queueEntry?.counter ?? 'General Intake'}</span></p>
                    <p>Pending: <span className="font-medium text-foreground">{queueEntry?.pendingLanes?.join(', ') || 'N/A'}</span></p>
                    <p>Lab No: <span className="font-medium text-foreground">{submittedRegistration?.labNumbers?.join(', ') || 'N/A'}</span></p>
                    {selectedLabServices.length > 0 && (
                      <p>
                        Selected Tests:{' '}
                        <span className="font-medium text-foreground">
                          {selectedLabServices.map((service) => service.name).join(', ')}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                {queueQrDataUrl ? (
                  <div className="rounded-lg border bg-white p-3 text-center">
                    <img src={queueQrDataUrl} alt="Queue QR code" className="h-32 w-32" />
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Scan for Visit
                    </p>
                  </div>
                ) : (
                  <div className="flex h-36 w-36 items-center justify-center rounded-lg border bg-white text-muted-foreground">
                    <QrCode className="h-10 w-10" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Staff may scan this QR code to open the patient visit/profile.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" className="h-11 flex-1" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print Slip
              </Button>
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => window.location.assign('/')}>
                Back to Portal
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex flex-col items-center justify-center p-4 py-12">
      <Card className="w-full max-w-3xl">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Patient Self-Registration</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Please fill in your details to begin your consultation.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  FIRST NAME
                </label>
                <Input
                  type="text"
                  name="firstName"
                  placeholder="Enter your first name"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  MIDDLE NAME
                </label>
                <Input
                  type="text"
                  name="middleName"
                  placeholder="Enter your middle name"
                  value={formData.middleName}
                  onChange={handleInputChange}
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  LAST NAME
                </label>
                <Input
                  type="text"
                  name="lastName"
                  placeholder="Enter your last name"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  COMPANY
                </label>
                <select
                  value={companyMode === 'manual' ? '__manual__' : formData.company}
                  onChange={(event) => handleCompanySelect(event.target.value)}
                  className="h-12 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Select a company</option>
                  {companyOptions.map((company) => (
                    <option key={company.id} value={company.companyName}>
                      {company.companyName}
                    </option>
                  ))}
                  <option value="__manual__">Other / Type manually</option>
                </select>
                {companyMode === 'manual' && (
                  <Input
                    type="text"
                    name="company"
                    placeholder="Enter your company"
                    value={formData.company}
                    onChange={handleInputChange}
                    className="mt-3 h-12"
                  />
                )}
                {companyMode === 'select' && companyOptions.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Choose a registered partner company, or switch to manual entry if needed.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  BIRTHDATE
                </label>
                <Input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-3 block">
                GENDER
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleGenderSelect('male')}
                  className={`h-12 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                    formData.gender === 'male'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-foreground hover:border-primary/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Male
                </button>
                <button
                  type="button"
                  onClick={() => handleGenderSelect('female')}
                  className={`h-12 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                    formData.gender === 'female'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-foreground hover:border-primary/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Female
                </button>
              </div>
            </div>

            {/* Contact Number */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                CONTACT NUMBER
              </label>
              <Input
                type="tel"
                name="contactNumber"
                placeholder="+63912 345 6789"
                value={formData.contactNumber}
                onChange={handleInputChange}
                required
                className="h-12"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  EMAIL ADDRESS
                </label>
                <Input
                  type="email"
                  name="emailAddress"
                  placeholder="Enter your email address"
                  value={formData.emailAddress}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  SERVICE NEEDED
                </label>
                <select
                  name="serviceNeeded"
                  value={formData.serviceNeeded}
                  onChange={handleInputChange}
                  required
                  className="h-12 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Select a service</option>
                  <option value="Pre-Employment">Pre-Employment</option>
                  <option value="Check-Up">Check-Up</option>
                  <option value="Lab">Lab</option>
                </select>
              </div>

              {formData.serviceNeeded === 'Lab' && (
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                    LAB TEST CHECKLIST
                  </label>
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
                    {labServices.map((service) => (
                      <label key={service.code} className="flex items-start gap-3 rounded-md bg-background p-3 text-sm">
                        <Checkbox
                          checked={formData.selectedServiceCodes.includes(service.code)}
                          onCheckedChange={(checked) => handleLabServiceToggle(service.code, checked === true)}
                        />
                        <span>
                          <span className="block font-medium">{service.name}</span>
                          <span className="text-xs text-muted-foreground">{service.category}</span>
                        </span>
                      </label>
                    ))}
                    {!labServices.length && (
                      <p className="text-sm text-muted-foreground">No active lab services are available.</p>
                    )}
                  </div>
                </div>
              )}

              {formData.serviceNeeded === 'Pre-Employment' && (
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                    PRE-EMPLOYMENT REQUIREMENTS
                  </label>
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
                    {labServices.map((service) => (
                      <label key={service.code} className="flex items-start gap-3 rounded-md bg-background p-3 text-sm">
                        <Checkbox
                          checked={formData.selectedServiceCodes.includes(service.code)}
                          onCheckedChange={(checked) => handleLabServiceToggle(service.code, checked === true)}
                        />
                        <span>
                          <span className="block font-medium">{service.name}</span>
                          <span className="text-xs text-muted-foreground">{service.category}</span>
                        </span>
                      </label>
                    ))}
                    {!labServices.length && (
                      <p className="text-sm text-muted-foreground">No active lab services are available.</p>
                    )}
                  </div>
                  {selectedCompany?.requirements?.['pre-employment']?.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      The selected partner company has pre-employment requirements configured.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  STREET ADDRESS
                </label>
                <Input
                  type="text"
                  name="streetAddress"
                  placeholder="Enter your street address"
                  value={formData.streetAddress}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  CITY
                </label>
                <Input
                  type="text"
                  name="city"
                  placeholder="Enter your city"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  PROVINCE
                </label>
                <Input
                  type="text"
                  name="province"
                  placeholder="Enter your province"
                  value={formData.province}
                  onChange={handleInputChange}
                  required
                  className="h-12"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                  NOTES (OPTIONAL)
                </label>
                <Textarea
                  name="notes"
                  placeholder="Add notes for your visit"
                  value={formData.notes}
                  onChange={handleInputChange}
                  className="min-h-24"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold rounded-lg"
              disabled={isLoading}
            >
              {isLoading ? 'Submitting...' : 'Submit Registration'}
              {!isLoading && (
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              )}
            </Button>

            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
          </form>

          {/* Info Box */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="bg-secondary/50 border border-secondary rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-1">Your data is securely encrypted.</p>
                <p className="text-muted-foreground text-xs">
                  Registration is valid for 24 hours at the reception desk.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Footer */}
      <p className="text-xs text-muted-foreground mt-8">Globalife Medical Laboratory &amp; Polyclinic System</p>
    </div>
  );
}
