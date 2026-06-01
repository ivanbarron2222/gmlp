'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getStaffHomePath, staffNeedsDailyRole, syncStaffSessionFromSupabase } from '@/lib/station-role';

interface PageLayoutProps {
  children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        router.replace('/login');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      try {
        const profile = await syncStaffSessionFromSupabase();
        if (!profile) {
          router.replace('/login');
          return;
        }
        if (staffNeedsDailyRole(profile)) {
          router.replace('/staff/select-daily-role');
          return;
        }
        if (profile.jobPositionCode === 'medical_technologist' && profile.activeDailyRole === 'tester' && pathname === '/staff/queue') {
          router.replace(getStaffHomePath(profile));
          return;
        }
        setIsReady(true);
      } catch {
        await supabase.auth.signOut();
        router.replace('/login');
      }
    };

    void checkSession();
  }, [pathname, router]);

  if (!isReady) {
    return null;
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 ml-56">
        <Topbar />
        <main className="pt-16 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
