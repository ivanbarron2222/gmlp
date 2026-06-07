'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type VisitContextPayload = {
  visitContext: 'opd' | 'ape';
  apeEvent?: {
    apeCode: string;
    name: string;
    location: string;
  } | null;
};

export function ApeModeBanner() {
  const [context, setContext] = useState<VisitContextPayload | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const response = await fetch('/api/staff/visit-context', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        return;
      }

      setContext((await response.json()) as VisitContextPayload);
    };

    void loadContext();
  }, []);

  if (context?.visitContext !== 'ape') {
    return null;
  }

  return (
    <div className="mx-8 mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-amber-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em]">APE Mode Active</p>
          <p className="mt-1 text-sm">
            New registrations, queues, and results are being tagged as{' '}
            <span className="font-bold">{context.apeEvent?.name || 'Active APE mission'}</span>.
          </p>
        </div>
        {context.apeEvent?.location && (
          <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
            <MapPin className="h-3.5 w-3.5" />
            {context.apeEvent.location}
          </div>
        )}
      </div>
    </div>
  );
}
