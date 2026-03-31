/**
 * Mock data for the LIS Portal demonstration
 */

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  riskLevel: 'normal-risk' | 'critical';
}

export interface LabTest {
  id: string;
  name: string;
  code: string;
  category: 'Hematology' | 'Chemistry' | 'Immunology' | 'Microbiology';
  price: number;
  specimenType: string;
  available: boolean;
}

export interface LabOrder {
  id: string;
  patientId: string;
  tests: LabTest[];
  status: 'pending' | 'processing' | 'completed' | 'released';
  createdAt: Date;
  orderedBy: string;
}

export interface Specimen {
  id: string;
  orderId: string;
  patientName: string;
  testType: string;
  specimenType: string;
  status: 'pending' | 'processing' | 'done';
  collectedAt: Date;
  processedAt?: Date;
}

export interface TestResult {
  id: string;
  testName: string;
  value: number | string;
  unit: string;
  referenceRange: string;
  flag?: 'H' | 'L' | 'C';
}

// Mock patients
export const mockPatients: Patient[] = [
  {
    id: 'PT-882093',
    firstName: 'Martha',
    lastName: 'Henderson',
    dateOfBirth: '1960-03-15',
    gender: 'female',
    email: 'martha.henderson@email.com',
    phone: '+1 (555) 123-4567',
    address: '123 Oak Street',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    riskLevel: 'normal-risk',
  },
  {
    id: 'PT-024-8812',
    firstName: 'Eleanor',
    lastName: 'Sterling',
    dateOfBirth: '1956-10-12',
    gender: 'female',
    email: 'eleanor.sterling@email.com',
    phone: '+1 (555) 456-7890',
    address: '456 Pine Avenue',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94110',
    riskLevel: 'critical',
  },
  {
    id: 'PT-LIS-4402',
    firstName: 'Eleanor',
    lastName: 'Sterling',
    dateOfBirth: '1956-10-12',
    gender: 'female',
    email: 'eleanor.s@email.com',
    phone: '+1 (555) 789-0123',
    address: '789 Maple Drive',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    riskLevel: 'normal-risk',
  },
];

// Mock lab tests
export const mockLabTests: LabTest[] = [
  {
    id: 'TEST001',
    name: 'CBC w/ Platelet Count',
    code: 'CBC',
    category: 'Hematology',
    price: 45.0,
    specimenType: 'Whole Blood (EDTA)',
    available: true,
  },
  {
    id: 'TEST002',
    name: 'Lipid Profile',
    code: 'LIPID',
    category: 'Chemistry',
    price: 120.0,
    specimenType: 'Serum (SST)',
    available: true,
  },
  {
    id: 'TEST003',
    name: 'Urinalysis',
    code: 'UA',
    category: 'Immunology',
    price: 25.0,
    specimenType: 'Urine (Mid-stream)',
    available: true,
  },
  {
    id: 'TEST004',
    name: 'FBS',
    code: 'FBS',
    category: 'Chemistry',
    price: 35.0,
    specimenType: 'Serum',
    available: true,
  },
  {
    id: 'TEST005',
    name: 'HBA1C',
    code: 'HBA1C',
    category: 'Chemistry',
    price: 85.0,
    specimenType: 'Whole Blood (EDTA)',
    available: true,
  },
  {
    id: 'TEST006',
    name: 'ECG - 12 Lead',
    code: 'ECG',
    category: 'Immunology',
    price: 150.0,
    specimenType: 'Cardiac',
    available: true,
  },
];

// Mock specimens
export const mockSpecimens: Specimen[] = [
  {
    id: 'SP-9821',
    orderId: 'ORD-001',
    patientName: 'Eleanor Fitzwilliam',
    testType: 'Complete Blood Count',
    specimenType: 'Whole Blood',
    status: 'done',
    collectedAt: new Date('2024-01-15T10:45:00'),
    processedAt: new Date('2024-01-15T10:45:00'),
  },
  {
    id: 'SP-9822',
    orderId: 'ORD-002',
    patientName: 'Marcus Thorne',
    testType: 'Lipid Profile',
    specimenType: 'Serum',
    status: 'processing',
    collectedAt: new Date('2024-01-15T11:12:00'),
  },
  {
    id: 'SP-9823',
    orderId: 'ORD-003',
    patientName: 'Sienna Miller',
    testType: 'Urinalysis',
    specimenType: 'Urine',
    status: 'pending',
    collectedAt: new Date('2024-01-15T11:30:00'),
  },
  {
    id: 'SP-9824',
    orderId: 'ORD-004',
    patientName: 'Dr. Robert Chen',
    testType: 'HbA1c / Glucose',
    specimenType: 'Whole Blood',
    status: 'processing',
    collectedAt: new Date('2024-01-15T11:45:00'),
  },
  {
    id: 'SP-9825',
    orderId: 'ORD-005',
    patientName: 'Linda Garrick',
    testType: 'Liver Function Test',
    specimenType: 'Serum',
    status: 'pending',
    collectedAt: new Date('2024-01-15T12:05:00'),
  },
];

// Mock test results
export const mockTestResults: TestResult[] = [
  {
    id: 'RES001',
    testName: 'Hemoglobin',
    value: 14.2,
    unit: 'g/dL',
    referenceRange: '12.0 - 15.5',
  },
  {
    id: 'RES002',
    testName: 'Total Cholesterol',
    value: 192,
    unit: 'mg/dL',
    referenceRange: '< 200',
  },
  {
    id: 'RES003',
    testName: 'HBA1C (Glycated Hb)',
    value: 6.2,
    unit: '%',
    referenceRange: '4.0 - 5.6',
    flag: 'H',
  },
  {
    id: 'RES004',
    testName: 'Glucose, Fasting',
    value: 98,
    unit: 'mg/dL',
    referenceRange: '70 - 99',
  },
  {
    id: 'RES005',
    testName: 'Creatinine',
    value: 0.92,
    unit: 'mg/dL',
    referenceRange: '0.60 — 1.20',
  },
  {
    id: 'RES006',
    testName: 'Sodium (Na+)',
    value: 'Pending...',
    unit: 'mmol/L',
    referenceRange: '136 — 145',
  },
  {
    id: 'RES007',
    testName: 'Potassium (K+)',
    value: 3.1,
    unit: 'mmol/L',
    referenceRange: '3.5 — 5.1',
    flag: 'L',
  },
];

// Mock users
export const mockUsers = [
  {
    id: 'USER001',
    name: 'Dr. Elena Rodriguez',
    title: 'Senior Pathologist',
    email: 'elena.rodriguez@clinic.com',
    avatar: 'ER',
  },
  {
    id: 'USER002',
    name: 'Dr. Sarah Chen',
    title: 'Chief Technologist',
    email: 'sarah.chen@clinic.com',
    avatar: 'SC',
  },
  {
    id: 'USER003',
    name: 'Dr. Julian Vance',
    title: 'Lab Supervisor',
    email: 'julian.vance@clinic.com',
    avatar: 'JV',
  },
  {
    id: 'USER004',
    name: 'M. Technologist',
    title: 'Shift A • Core Lab',
    email: 'tech@clinic.com',
    avatar: 'MT',
  },
];

// Dashboard metrics
export const mockDashboardMetrics = {
  patientsToday: { value: 148, change: 12 },
  pendingTests: { value: 32, critical: true },
  releasedResults: { value: 114, change: -5 },
  revenueToday: { value: 4820, change: 4 },
};

// Recent patients
export const mockRecentPatients = [
  {
    initials: 'JD',
    name: 'Jameson, David',
    id: 'ILAB-9921',
    requestTime: '09:42 AM',
    status: 'released' as const,
  },
  {
    initials: 'EM',
    name: 'Escobar, Maria',
    id: 'ILAB-9925',
    requestTime: '10:15 AM',
    status: 'processing' as const,
  },
  {
    initials: 'LW',
    name: 'Lee, Winston',
    id: 'ILAB-9930',
    requestTime: '10:28 AM',
    status: 'pending' as const,
  },
];

// Live queue
export const mockLiveQueue = [
  {
    position: '01',
    name: 'Sarah Connor',
    service: 'CBC • Full Profile',
  },
  {
    position: '02',
    name: 'John McClane',
    service: 'Blood Typing',
  },
  {
    position: '03',
    name: 'Ellen Ripley',
    service: 'Glucose (Fasting)',
  },
];

// Pending validations
export const mockPendingValidations = [
  {
    id: 'VAL001',
    testName: 'Hemoglobin Atc',
    priority: 'urgent' as const,
    patient: 'Arthur Curry',
    action: 'Verify',
  },
  {
    id: 'VAL002',
    testName: 'Electrolytes Panel',
    priority: 'routine' as const,
    patient: 'Diana Prince',
    action: 'Verify',
  },
];
