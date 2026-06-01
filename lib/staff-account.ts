import type { StationRole } from '@/lib/station-role';

export type DepartmentCode =
  | 'administration'
  | 'front_desk'
  | 'laboratory'
  | 'radiology'
  | 'clinical_exam'
  | 'drug_testing';

export type JobPositionCode =
  | 'administrator'
  | 'front_desk_cashier'
  | 'medical_technologist'
  | 'nurse'
  | 'doctor'
  | 'encoder'
  | 'radiology_staff'
  | 'drug_test_staff';

export type MedtechDailyRole = 'extractor' | 'tester';

export const departmentCatalog: Array<{ code: DepartmentCode; label: string }> = [
  { code: 'administration', label: 'Administration' },
  { code: 'front_desk', label: 'Front Desk / Cashier' },
  { code: 'laboratory', label: 'Laboratory' },
  { code: 'radiology', label: 'Radiology / X-ray' },
  { code: 'clinical_exam', label: 'Clinical Examination' },
  { code: 'drug_testing', label: 'Drug Testing' },
];

export const jobPositionCatalog: Array<{ code: JobPositionCode; label: string }> = [
  { code: 'administrator', label: 'Administrator' },
  { code: 'front_desk_cashier', label: 'Front Desk / Cashier' },
  { code: 'medical_technologist', label: 'Medical Technologist' },
  { code: 'nurse', label: 'Nurse' },
  { code: 'doctor', label: 'Doctor' },
  { code: 'encoder', label: 'Encoder' },
  { code: 'radiology_staff', label: 'Radiology Staff' },
  { code: 'drug_test_staff', label: 'Drug Testing Staff' },
];

export function getDepartmentLabel(code?: string | null) {
  return departmentCatalog.find((item) => item.code === code)?.label ?? 'Unassigned Department';
}

export function getJobPositionLabel(code?: string | null) {
  return jobPositionCatalog.find((item) => item.code === code)?.label ?? 'Unassigned Position';
}

export function isMedicalTechnologist(position?: string | null): position is 'medical_technologist' {
  return position === 'medical_technologist';
}

export function getLegacyRoleForAccount(
  department: DepartmentCode,
  position: JobPositionCode
): {
  dbRole: string;
  stationRole: StationRole;
  assignedLane: string | null;
} {
  switch (position) {
    case 'administrator':
      return { dbRole: 'admin', stationRole: 'admin', assignedLane: null };
    case 'front_desk_cashier':
      return { dbRole: 'cashier', stationRole: 'cashier', assignedLane: null };
    case 'medical_technologist':
      return { dbRole: 'blood_test', stationRole: 'blood-test', assignedLane: 'blood_test' };
    case 'doctor':
      return { dbRole: 'doctor', stationRole: 'doctor', assignedLane: 'doctor' };
    case 'nurse':
      return { dbRole: 'nurse', stationRole: 'nurse', assignedLane: null };
    case 'encoder':
      return { dbRole: 'encoder', stationRole: 'encoder', assignedLane: null };
    case 'radiology_staff':
      return { dbRole: 'xray', stationRole: 'xray', assignedLane: 'xray' };
    case 'drug_test_staff':
      return { dbRole: 'drug_test', stationRole: 'drug-test', assignedLane: 'drug_test' };
    default:
      return department === 'radiology'
        ? { dbRole: 'xray', stationRole: 'xray', assignedLane: 'xray' }
        : { dbRole: 'encoder', stationRole: 'encoder', assignedLane: null };
  }
}
