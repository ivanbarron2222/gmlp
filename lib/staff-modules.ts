import type { StationRole } from '@/lib/station-role';

export type StaffModulePath =
  | '/dashboard'
  | '/staff/activity-log'
  | '/staff/doctors'
  | '/staff/patient-registration'
  | '/staff/queue'
  | '/staff/cashier'
  | '/staff/patient-records'
  | '/staff/lab-orders'
  | '/staff/specimen-tracking'
  | '/staff/result-encoding'
  | '/staff/result-release'
  | '/staff/settings';

export const moduleCatalog: Array<{ label: string; href: StaffModulePath }> = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Activity Log', href: '/staff/activity-log' },
  { label: 'Doctors', href: '/staff/doctors' },
  { label: 'Patient Registration', href: '/staff/patient-registration' },
  { label: 'Queue Management', href: '/staff/queue' },
  { label: 'Cashier / Billing', href: '/staff/cashier' },
  { label: 'Patient Records', href: '/staff/patient-records' },
  { label: 'Lab Orders', href: '/staff/lab-orders' },
  { label: 'Specimen Tracking', href: '/staff/specimen-tracking' },
  { label: 'Result Encoding', href: '/staff/result-encoding' },
  { label: 'Result Release', href: '/staff/result-release' },
  { label: 'Admin Settings', href: '/staff/settings' },
];

export function getDefaultAllowedModules(role: StationRole): StaffModulePath[] {
  switch (role) {
    case 'admin':
      return moduleCatalog.map((moduleItem) => moduleItem.href);
    case 'nurse':
      return ['/dashboard', '/staff/doctors', '/staff/patient-registration', '/staff/queue', '/staff/patient-records'];
    case 'blood-test':
    case 'drug-test':
    case 'xray':
    case 'ecg':
      return ['/dashboard', '/staff/queue', '/staff/lab-orders'];
    case 'encoder':
      return ['/dashboard', '/staff/patient-records', '/staff/result-release'];
    case 'doctor':
      return ['/dashboard', '/staff/queue', '/staff/result-encoding', '/staff/patient-records'];
    case 'cashier':
      return [
        '/dashboard',
        '/staff/patient-registration',
        '/staff/queue',
        '/staff/cashier',
        '/staff/patient-records',
        '/staff/result-release',
      ];
    default:
      return moduleCatalog.map((moduleItem) => moduleItem.href);
  }
}

export function sanitizeAllowedModules(input: unknown): StaffModulePath[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const validHrefs = new Set(moduleCatalog.map((moduleItem) => moduleItem.href));
  return input
    .map((value) => String(value))
    .filter((value): value is StaffModulePath => validHrefs.has(value as StaffModulePath));
}
