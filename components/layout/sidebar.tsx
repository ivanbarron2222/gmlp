'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  History,
  UserPlus,
  FileText,
  ShoppingCart,
  FolderKanban,
  FlaskConical,
  Clipboard,
  CheckCircle2,
  Tickets,
  Settings2,
  LogOut,
} from 'lucide-react';
import {
  clearStationRole,
  getRoleLabel,
  readStaffProfile,
  readStationRole,
  syncStaffSessionFromSupabase,
  type StationRole,
} from '@/lib/station-role';
import { getDefaultAllowedModules } from '@/lib/staff-modules';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Activity Log',
    href: '/staff/activity-log',
    icon: History,
  },
  {
    label: 'Patient Registration',
    href: '/staff/patient-registration',
    icon: UserPlus,
  },
  {
    label: 'Queue Management',
    href: '/staff/queue',
    icon: Tickets,
  },
  {
    label: 'Cashier/Billing',
    href: '/staff/cashier',
    icon: ShoppingCart,
  },
  {
    label: 'Patient Records',
    href: '/staff/patient-records',
    icon: FolderKanban,
  },
  {
    label: 'Lab Orders',
    href: '/staff/lab-orders',
    icon: FileText,
  },
  {
    label: 'Specimen Tracking',
    href: '/staff/specimen-tracking',
    icon: FlaskConical,
  },
  {
    label: 'Result Encoding',
    href: '/staff/result-encoding',
    icon: Clipboard,
  },
  {
    label: 'Result Release',
    href: '/staff/result-release',
    icon: CheckCircle2,
  },
  {
    label: 'Admin Settings',
    href: '/staff/settings',
    icon: Settings2,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [stationRole, setStationRole] = useState<StationRole | null>(null);
  const [staffName, setStaffName] = useState('');
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedRole = readStationRole();
    const storedProfile = readStaffProfile();
    setStationRole(storedRole);
    setStaffName(storedProfile?.fullName ?? '');
    setAllowedModules(storedProfile?.allowedModules ?? []);
    setIsHydrated(true);

    syncStaffSessionFromSupabase()
      .then((profile) => {
        if (profile) {
          setStationRole(profile.role);
          setStaffName(profile.fullName);
          setAllowedModules(profile.allowedModules ?? []);
        }
      })
      .catch(() => {
        // keep local fallback
      });
  }, []);

  const visibleNavItems = useMemo(() => {
    if (!isHydrated) {
      return [];
    }

    if (!stationRole) {
      return navItems;
    }

    const baseAllowed = new Set(getDefaultAllowedModules(stationRole));
    const effectiveAllowed =
      allowedModules.length > 0
        ? allowedModules.filter((href) => baseAllowed.has(href as never))
        : Array.from(baseAllowed);

    return navItems.filter((item) => effectiveAllowed.includes(item.href));
  }, [allowedModules, isHydrated, stationRole]);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    clearStationRole();
    setStationRole(null);
    setStaffName('');
    setAllowedModules([]);
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-sidebar border-r border-sidebar-border pt-4 overflow-y-auto">
      {/* Logo */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-sm text-sidebar-foreground">LIS Portal</h1>
            <p className="text-xs text-sidebar-foreground/60">
              {isHydrated && stationRole ? getRoleLabel(stationRole) : 'Medical Suite v1.0'}
            </p>
            {isHydrated && staffName && (
              <p className="mt-0.5 text-[11px] text-sidebar-foreground/50">{staffName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="px-3">
        <div className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border bg-sidebar p-4">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
