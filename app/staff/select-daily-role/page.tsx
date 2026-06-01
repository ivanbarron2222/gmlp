'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, TestTube2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStaffHomePath, syncStaffSessionFromSupabase } from '@/lib/station-role';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type DailyRole = 'extractor' | 'tester';

export default function SelectDailyRolePage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<DailyRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (!selectedRole) {
      setError('Select your work assignment for today.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase!.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Missing authenticated session.');
      }

      const response = await fetch('/api/staff/daily-role', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: selectedRole }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save daily role.');
      }

      const profile = await syncStaffSessionFromSupabase();
      if (!profile) {
        throw new Error('Unable to reload staff profile.');
      }

      router.replace(getStaffHomePath(profile));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save daily role.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center">
        <Card className="w-full p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Daily Assignment</p>
          <h1 className="mt-2 text-3xl font-bold">Choose your Medical Technologist role</h1>
          <p className="mt-2 text-muted-foreground">
            Your selection applies for today based on Manila time. Sign in again tomorrow to choose the next assignment.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedRole('extractor')}
              className={`rounded-2xl border p-6 text-left transition-colors ${selectedRole === 'extractor' ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}
            >
              <FlaskConical className="h-8 w-8 text-primary" />
              <h2 className="mt-4 text-xl font-bold">Extractor</h2>
              <p className="mt-2 text-sm text-muted-foreground">Handle the extraction queue, call patients, and complete collection tasks.</p>
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('tester')}
              className={`rounded-2xl border p-6 text-left transition-colors ${selectedRole === 'tester' ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}
            >
              <TestTube2 className="h-8 w-8 text-primary" />
              <h2 className="mt-4 text-xl font-bold">Tester</h2>
              <p className="mt-2 text-sm text-muted-foreground">Open patient profiles and encode CBC or urinalysis results.</p>
            </button>
          </div>

          {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <Button className="mt-6 w-full" onClick={() => void handleContinue()} disabled={!selectedRole || isSaving}>
            {isSaving ? 'Saving assignment...' : 'Continue'}
          </Button>
        </Card>
      </div>
    </div>
  );
}
