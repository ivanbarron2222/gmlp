import type { StationRole } from '@/lib/station-role';

export type ActionPermission =
  | 'validate_report'
  | 'release_report'
  | 'flag_report_review'
  | 'edit_billing'
  | 'void_payment'
  | 'reopen_visit'
  | 'merge_patient'
  | 'manage_specimens'
  | 'manage_inventory'
  | 'manage_retention'
  | 'manage_appointments'
  | 'override_queue'
  | 'edit_patient_demographics';

export const actionPermissionCatalog: Array<{ key: ActionPermission; label: string; description: string }> = [
  { key: 'validate_report', label: 'Validate Reports', description: 'Mark reports as validated.' },
  { key: 'release_report', label: 'Release Reports', description: 'Release reports and PDFs to patients.' },
  { key: 'flag_report_review', label: 'Flag Reviews', description: 'Flag machine imports or reports for review.' },
  { key: 'edit_billing', label: 'Edit Billing', description: 'Prepare or adjust invoice line items.' },
  { key: 'void_payment', label: 'Void Payments', description: 'Void or refund billing transactions.' },
  { key: 'reopen_visit', label: 'Reopen Visits', description: 'Reopen completed visits for correction.' },
  { key: 'merge_patient', label: 'Merge Patients', description: 'Merge duplicate patient identities.' },
  { key: 'manage_specimens', label: 'Manage Specimens', description: 'Advance specimen lifecycle states.' },
  { key: 'manage_inventory', label: 'Manage Inventory', description: 'Adjust stock and inventory activity.' },
  { key: 'manage_retention', label: 'Manage Retention', description: 'Update archive and retention rules.' },
  { key: 'manage_appointments', label: 'Manage Appointments', description: 'Create and update doctor schedules.' },
  { key: 'override_queue', label: 'Override Queue', description: 'Force queue overrides with a reason.' },
  {
    key: 'edit_patient_demographics',
    label: 'Edit Patient Demographics',
    description: 'Correct patient details after verification.',
  },
];

const permissionSetByRole: Record<StationRole, ActionPermission[]> = {
  admin: actionPermissionCatalog.map((item) => item.key),
  nurse: ['manage_appointments', 'override_queue', 'edit_patient_demographics', 'reopen_visit'],
  'blood-test': ['manage_specimens'],
  'drug-test': ['manage_specimens'],
  doctor: ['manage_appointments', 'edit_patient_demographics'],
  xray: ['manage_specimens'],
  ecg: ['manage_specimens'],
  encoder: ['validate_report', 'release_report', 'flag_report_review'],
  cashier: ['edit_billing', 'void_payment', 'reopen_visit'],
};

export function getDefaultActionPermissions(role: StationRole): ActionPermission[] {
  return permissionSetByRole[role] ?? [];
}

export function sanitizeActionPermissions(input: unknown): ActionPermission[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const validKeys = new Set(actionPermissionCatalog.map((item) => item.key));
  return Array.from(
    new Set(
      input
        .map((value) => String(value))
        .filter((value): value is ActionPermission => validKeys.has(value as ActionPermission))
    )
  );
}
