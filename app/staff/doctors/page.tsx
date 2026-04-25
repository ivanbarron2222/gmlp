'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Stethoscope } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type DoctorAvailabilityRow = {
  id: string;
  fullName: string;
  isAvailableToday: boolean;
};

async function getStaffAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase!.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Missing authenticated session.');
  }

  return session.access_token;
}

function formatAvailabilityDate(value: string) {
  if (!value) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function StaffDoctorsPage() {
  const [doctors, setDoctors] = useState<DoctorAvailabilityRow[]>([]);
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [savingDoctorId, setSavingDoctorId] = useState<string | null>(null);

  const availableCount = useMemo(
    () => doctors.filter((doctor) => doctor.isAvailableToday).length,
    [doctors]
  );

  const loadDoctors = async () => {
    setIsLoading(true);
    setPageError('');

    try {
      const token = await getStaffAccessToken();
      const response = await fetch('/api/staff/doctor-availability', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json()) as {
        error?: string;
        availabilityDate?: string;
        doctors?: DoctorAvailabilityRow[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load doctors.');
      }

      setAvailabilityDate(payload.availabilityDate ?? '');
      setDoctors(payload.doctors ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load doctors.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDoctors();
  }, []);

  const toggleDoctor = async (doctor: DoctorAvailabilityRow, checked: boolean) => {
    setSavingDoctorId(doctor.id);
    setPageError('');
    setPageNotice('');
    setDoctors((current) =>
      current.map((item) =>
        item.id === doctor.id ? { ...item, isAvailableToday: checked } : item
      )
    );

    try {
      const token = await getStaffAccessToken();
      const response = await fetch('/api/staff/doctor-availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctorId: doctor.id,
          isAvailableToday: checked,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to update doctor availability.');
      }

      setPageNotice(`${doctor.fullName} marked as ${checked ? 'available' : 'not available'} today.`);
    } catch (error) {
      setDoctors((current) =>
        current.map((item) =>
          item.id === doctor.id ? { ...item, isAvailableToday: doctor.isAvailableToday } : item
        )
      );
      setPageError(error instanceof Error ? error.message : 'Unable to update doctor availability.');
    } finally {
      setSavingDoctorId(null);
    }
  };

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">Nurse Tools</p>
            <h1 className="mt-2 text-3xl font-bold">Doctors</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Set which doctors can be assigned to check-up patients today.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="min-w-32 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available</p>
              <p className="mt-2 text-3xl font-black text-primary">{availableCount}</p>
            </Card>
            <Card className="min-w-32 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Listed</p>
              <p className="mt-2 text-3xl font-black">{doctors.length}</p>
            </Card>
          </div>
        </div>

        {pageNotice && (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {pageNotice}
          </div>
        )}

        {pageError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        <Card className="mt-8 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Doctor Availability</h2>
                <p className="text-sm text-muted-foreground">Availability resets by date.</p>
              </div>
            </div>
            {availabilityDate && (
              <Badge variant="outline" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                {formatAvailabilityDate(availabilityDate)}
              </Badge>
            )}
          </div>

          <div className="mt-6 divide-y rounded-lg border">
            {doctors.map((doctor) => (
              <div key={doctor.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold">{doctor.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {doctor.isAvailableToday ? 'Available for check-up assignment' : 'Not available today'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      doctor.isAvailableToday
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                    }
                  >
                    {doctor.isAvailableToday ? 'Available' : 'Unavailable'}
                  </Badge>
                  <Switch
                    checked={doctor.isAvailableToday}
                    disabled={savingDoctorId === doctor.id}
                    onCheckedChange={(checked) => void toggleDoctor(doctor, checked)}
                  />
                </div>
              </div>
            ))}

            {!doctors.length && !isLoading && (
              <div className="p-8 text-center text-muted-foreground">
                No doctors found. Add doctors from Admin Settings first.
              </div>
            )}

            {isLoading && (
              <div className="p-8 text-center text-muted-foreground">
                Loading doctors...
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
