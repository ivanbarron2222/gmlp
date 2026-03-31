'use client';

import { Bell, Settings, Search, LogOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  clearStationRole,
  getRoleLabel,
  readStaffProfile,
  readStationRole,
  syncStaffSessionFromSupabase,
  type StationRole,
} from '@/lib/station-role';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function Topbar() {
  const router = useRouter();
  const [stationRole, setStationRole] = useState<StationRole | null>(null);
  const [staffName, setStaffName] = useState('');

  useEffect(() => {
    setStationRole(readStationRole());
    setStaffName(readStaffProfile()?.fullName ?? '');

    syncStaffSessionFromSupabase()
      .then((profile) => {
        if (profile) {
          setStationRole(profile.role);
          setStaffName(profile.fullName);
        }
      })
      .catch(() => {
        // keep local fallback
      });
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    clearStationRole();
    router.push('/login');
  };

  const accountLabel = stationRole ? getRoleLabel(stationRole) : 'LIS User';
  const accountInitials = useMemo(() => {
    return accountLabel
      .split(/[\s/]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [accountLabel]);

  return (
    <header className="fixed top-0 left-56 right-0 h-16 bg-background border-b border-border flex items-center justify-between px-6 z-40">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search patients..."
            className="pl-10 h-10 bg-muted border-border"
          />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-4 ml-auto">
        <Button variant="ghost" size="icon">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleSignOut}>
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{staffName || accountLabel}</p>
            <p className="text-xs text-muted-foreground">{accountLabel}</p>
          </div>
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm">
            {accountInitials || 'LI'}
          </div>
        </div>
      </div>
    </header>
  );
}
