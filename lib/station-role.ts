import { QueueEntry, QueueLane } from '@/lib/queue-store';
import { sanitizeActionPermissions, type ActionPermission } from '@/lib/action-permissions';
import { sanitizeAllowedModules, type StaffModulePath } from '@/lib/staff-modules';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type StationRole =
  | 'admin'
  | 'nurse'
  | 'blood-test'
  | 'drug-test'
  | 'doctor'
  | 'xray'
  | 'ecg'
  | 'encoder'
  | 'cashier';

export const stationRoles: StationRole[] = [
  'admin',
  'nurse',
  'blood-test',
  'drug-test',
  'doctor',
  'xray',
  'ecg',
  'encoder',
  'cashier',
];

export const STATION_ROLE_STORAGE_KEY = 'gmlp-station-role';
export const STAFF_PROFILE_STORAGE_KEY = 'gmlp-staff-profile';

export interface StaffProfileSession {
  id: string;
  email: string;
  fullName: string;
  role: StationRole;
  allowedModules: StaffModulePath[];
  actionPermissions: ActionPermission[];
}

export function getRoleLabel(role: StationRole) {
  switch (role) {
    case 'admin':
      return 'System Administrator';
    case 'nurse':
      return 'Nurse / Reception';
    case 'blood-test':
      return 'Blood Test Station';
    case 'drug-test':
      return 'Drug Test Station';
    case 'doctor':
      return 'Doctor Station';
    case 'xray':
      return 'Xray Station';
    case 'ecg':
      return 'ECG Station';
    case 'encoder':
      return 'Encoder';
    case 'cashier':
      return 'Cashier / Front Desk';
    default:
      return role;
  }
}

export function readStationRole() {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(STATION_ROLE_STORAGE_KEY);
  return stationRoles.includes(value as StationRole) ? (value as StationRole) : null;
}

export function writeStationRole(role: StationRole) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STATION_ROLE_STORAGE_KEY, role);
}

export function readStaffProfile() {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(STAFF_PROFILE_STORAGE_KEY);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as StaffProfileSession;

    if (!parsed || !stationRoles.includes(parsed.role)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeStaffProfile(profile: StaffProfileSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STAFF_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearStationRole() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STATION_ROLE_STORAGE_KEY);
  window.localStorage.removeItem(STAFF_PROFILE_STORAGE_KEY);
}

export function mapDbRoleToStationRole(role: string): StationRole | null {
  switch (role) {
    case 'admin':
      return 'admin';
    case 'nurse':
      return 'nurse';
    case 'blood_test':
      return 'blood-test';
    case 'drug_test':
      return 'drug-test';
    case 'doctor':
      return 'doctor';
    case 'xray':
      return 'xray';
    case 'ecg':
      return 'ecg';
    case 'encoder':
      return 'encoder';
    case 'cashier':
      return 'cashier';
    default:
      return null;
  }
}

export async function syncStaffSessionFromSupabase() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    clearStationRole();
    return null;
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, email, full_name, role, is_active, allowed_modules, action_permissions')
    .eq('id', session.user.id)
    .single();

  if (error || !data) {
    clearStationRole();
    throw new Error(error?.message ?? 'Staff profile not found.');
  }

  const stationRole = mapDbRoleToStationRole(String(data.role));

  if (!stationRole) {
    clearStationRole();
    throw new Error('Your account role is not allowed in this app.');
  }

  if (!data.is_active) {
    clearStationRole();
    throw new Error('Your staff account is pending admin activation.');
  }

  writeStationRole(stationRole);
  writeStaffProfile({
    id: String(data.id),
    email: String(data.email ?? session.user.email ?? ''),
    fullName: String(data.full_name ?? ''),
    role: stationRole,
    allowedModules: sanitizeAllowedModules(data.allowed_modules),
    actionPermissions: sanitizeActionPermissions(data.action_permissions),
  });

  return {
    id: String(data.id),
    email: String(data.email ?? session.user.email ?? ''),
    fullName: String(data.full_name ?? ''),
    role: stationRole,
    allowedModules: sanitizeAllowedModules(data.allowed_modules),
    actionPermissions: sanitizeActionPermissions(data.action_permissions),
  } satisfies StaffProfileSession;
}

export function getRoleLane(role: StationRole): QueueLane | null {
  switch (role) {
    case 'blood-test':
      return 'BLOOD TEST';
    case 'drug-test':
      return 'DRUG TEST';
    case 'doctor':
      return 'DOCTOR';
    case 'xray':
      return 'XRAY';
    case 'ecg':
      return 'ECG';
    default:
      return null;
  }
}

export function getRoleHomePath(role: StationRole) {
  switch (role) {
    case 'admin':
      return '/dashboard';
    case 'nurse':
      return '/staff/patient-registration';
    case 'blood-test':
    case 'drug-test':
    case 'xray':
    case 'ecg':
      return '/staff/lab-orders';
    case 'encoder':
      return '/staff/result-release';
    case 'doctor':
      return '/staff/result-encoding';
    case 'cashier':
      return '/staff/patient-registration';
    default:
      return '/dashboard';
  }
}

export function resolveScanRedirect(role: StationRole, entry: QueueEntry) {
  if (role === 'admin') {
    return null;
  }

  if (role === 'nurse') {
    return `/staff/patient-registration?queueId=${entry.id}`;
  }

  if (role === 'cashier') {
    return `/staff/cashier?queueId=${entry.id}`;
  }

  if (role === 'encoder') {
    return `/staff/result-release?queueId=${entry.id}`;
  }

  const lane = getRoleLane(role);

  if (!lane) {
    return null;
  }

  const isRelevant =
    entry.currentLane === lane ||
    entry.pendingLanes.includes(lane) ||
    entry.completedLanes.includes(lane);

  if (!isRelevant) {
    return null;
  }

  if (lane === 'DOCTOR') {
    return `/staff/result-encoding?queueId=${entry.id}&lane=${encodeURIComponent(lane)}`;
  }

  return `/staff/lab-orders?queueId=${entry.id}&lane=${encodeURIComponent(lane)}&mode=station`;
}
