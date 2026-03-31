'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { syncStaffSessionFromSupabase } from '@/lib/station-role';

interface PageLayoutProps {
  children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const router = useRouter();
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
        await syncStaffSessionFromSupabase();
        setIsReady(true);
      } catch {
        await supabase.auth.signOut();
        router.replace('/login');
      }
    };

    void checkSession();
  }, [router]);

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
