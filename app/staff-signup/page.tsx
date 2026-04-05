'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const roleOptions = [
  { value: 'nurse', label: 'Nurse / Reception' },
  { value: 'blood_test', label: 'Blood Test' },
  { value: 'drug_test', label: 'Drug Test' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'xray', label: 'Xray' },
  { value: 'ecg', label: 'ECG' },
  { value: 'encoder', label: 'Encoder' },
  { value: 'cashier', label: 'Cashier / Front Desk' },
  { value: 'pathologist', label: 'Pathologist' },
] as const;

export default function StaffSignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof roleOptions)[number]['value']>('nurse');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/staff/self-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to submit staff registration.');
      }

      setNotice(payload.message ?? 'Staff registration submitted. Wait for admin activation.');
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('nurse');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to submit staff registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <div className="p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold">Staff Account Request</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Submit your staff account details. An admin must activate the account before you can sign in.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">FULL NAME</label>
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">EMAIL ADDRESS</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ROLE</label>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as (typeof roleOptions)[number]['value'])}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">PASSWORD</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Staff Registration'}
            </Button>

            {notice && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </form>

          <div className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
            Already have an activated account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
