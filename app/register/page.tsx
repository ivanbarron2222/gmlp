'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  addPendingRegistration,
  RegistrationFormInput,
  RegistrationService,
  RequestedLabService,
} from '@/lib/registration-store';

export default function PatientRegistrationPage() {
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
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
    notes: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
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
          companies?: Array<{ companyName?: string }>;
        };
      })
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        const nextOptions = (payload.companies ?? [])
          .map((company) => String(company.companyName ?? '').trim())
          .filter(Boolean);

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

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      ...(name === 'serviceNeeded' && value !== 'Lab' ? { requestedLabService: '' } : {}),
      [name]: value,
    }));
  };

  const handleGenderSelect = (gender: string) => {
    setFormData((prev) => ({
      ...prev,
      gender,
    }));
  };

  const isKnownCompany = useMemo(
    () => companyOptions.includes(formData.company),
    [companyOptions, formData.company]
  );

  const handleCompanySelect = (value: string) => {
    if (value === '__manual__') {
      setCompanyMode('manual');
      setFormData((prev) => ({
        ...prev,
        company: isKnownCompany ? '' : prev.company,
      }));
      return;
    }

    setCompanyMode('select');
    setFormData((prev) => ({
      ...prev,
      company: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSubmitError('');

    try {
      await addPendingRegistration({
        ...formData,
        gender: formData.gender.toLowerCase(),
        serviceNeeded: formData.serviceNeeded as RegistrationService,
        requestedLabService: formData.requestedLabService as RequestedLabService | '',
      } as RegistrationFormInput);
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

  if (isSubmitted) {
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
              Your self-registration has been successfully submitted. Please proceed to the reception desk for verification and the next steps in your visit.
            </p>

            <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 text-left text-sm mb-6">
              <p className="font-semibold text-accent mb-3">Registration Details</p>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p>Name: <span className="font-medium text-foreground">{fullName}</span></p>
                <p>Company: <span className="font-medium text-foreground">{formData.company || 'N/A'}</span></p>
                <p>Date of Birth: <span className="font-medium text-foreground">{formData.birthDate}</span></p>
                <p>Contact: <span className="font-medium text-foreground">{formData.contactNumber}</span></p>
                <p>Email: <span className="font-medium text-foreground">{formData.emailAddress}</span></p>
                <p>Service: <span className="font-medium text-foreground">{formData.serviceNeeded}</span></p>
                {formData.serviceNeeded === 'Lab' && (
                  <p>Lab Area: <span className="font-medium text-foreground">{formData.requestedLabService}</span></p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                This registration is valid for <strong>24 hours</strong> at the reception desk.
              </p>
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
                    <option key={company} value={company}>
                      {company}
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
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                    LAB SERVICE
                  </label>
                  <select
                    name="requestedLabService"
                    value={formData.requestedLabService}
                    onChange={handleInputChange}
                    required
                    className="h-12 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">Select a lab service</option>
                    <option value="Blood Test">Blood Test</option>
                    <option value="Drug Test">Drug Test</option>
                    <option value="Xray">Xray</option>
                    <option value="ECG">ECG</option>
                  </select>
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
