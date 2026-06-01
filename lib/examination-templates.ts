export type ExaminationField = {
  key: string;
  label: string;
  group: string;
  control: 'text' | 'number' | 'select' | 'textarea';
  options?: string[];
  unit?: string;
  normal?: string;
  normalValue?: string;
  min?: number;
  max?: number;
  step?: string;
};

export type ExaminationTemplate = {
  version: number;
  label: string;
  fields: ExaminationField[];
};

const negativeOptions = ['Negative', 'Trace', 'Positive'];
const frequencyOptions = ['None', 'Rare', 'Occasional', 'Few', 'Moderate', 'Many'];

export const examinationTemplates: Record<string, ExaminationTemplate> = {
  physical_exam: {
    version: 1,
    label: 'Physical Examination',
    fields: [
      { key: 'general_findings', label: 'General Findings', group: 'Examination', control: 'textarea', normalValue: 'No significant physical findings.' },
      { key: 'blood_pressure', label: 'Blood Pressure', group: 'Vital Signs', control: 'text', unit: 'mmHg' },
      { key: 'heart_rate', label: 'Heart Rate', group: 'Vital Signs', control: 'number', unit: 'bpm', min: 60, max: 100 },
      { key: 'respiratory_rate', label: 'Respiratory Rate', group: 'Vital Signs', control: 'number', unit: 'breaths/min', min: 12, max: 20 },
      { key: 'assessment', label: 'Assessment', group: 'Examination', control: 'textarea' },
    ],
  },
  cbc: {
    version: 1,
    label: 'Hematology / CBC',
    fields: [
      { key: 'hemoglobin', label: 'Hemoglobin', group: 'CBC', control: 'number', unit: 'g/L', min: 120, max: 180, step: '0.1' },
      { key: 'hematocrit', label: 'Hematocrit', group: 'CBC', control: 'number', unit: 'L/L', min: 0.37, max: 0.54, step: '0.01' },
      { key: 'red_blood_count', label: 'Red Blood Count', group: 'CBC', control: 'number', unit: 'x10^12/L', min: 4, max: 6.2, step: '0.1' },
      { key: 'white_blood_count', label: 'White Blood Count', group: 'CBC', control: 'number', unit: 'x10^9/L', min: 5, max: 10, step: '0.1' },
      { key: 'segmenters', label: 'Segmenters', group: 'Differential Count', control: 'number', unit: '%', min: 40, max: 75 },
      { key: 'lymphocytes', label: 'Lymphocytes', group: 'Differential Count', control: 'number', unit: '%', min: 20, max: 45 },
      { key: 'monocytes', label: 'Monocytes', group: 'Differential Count', control: 'number', unit: '%', min: 1, max: 7 },
      { key: 'eosinophils', label: 'Eosinophils', group: 'Differential Count', control: 'number', unit: '%', min: 1, max: 5 },
      { key: 'basophils', label: 'Basophils', group: 'Differential Count', control: 'number', unit: '%', min: 0, max: 1 },
      { key: 'stab_cells', label: 'Stab Cells', group: 'Differential Count', control: 'number', unit: '%', min: 0, max: 5 },
      { key: 'blood_typing', label: 'Blood Typing', group: 'Blood Typing', control: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    ],
  },
  urinalysis: {
    version: 1,
    label: 'Urinalysis',
    fields: [
      { key: 'color', label: 'Color', group: 'Physical Properties', control: 'select', options: ['Light Yellow', 'Yellow', 'Dark Yellow', 'Amber', 'Red', 'Other'], normalValue: 'Light Yellow' },
      { key: 'transparency', label: 'Transparency', group: 'Physical Properties', control: 'select', options: ['Clear', 'Slightly Turbid', 'Turbid'], normalValue: 'Clear' },
      { key: 'reaction', label: 'Reaction / pH', group: 'Chemical Examination', control: 'number', min: 4.5, max: 8, step: '0.1' },
      { key: 'specific_gravity', label: 'Specific Gravity', group: 'Chemical Examination', control: 'number', min: 1.005, max: 1.03, step: '0.001' },
      { key: 'albumin', label: 'Albumin', group: 'Chemical Examination', control: 'select', options: negativeOptions, normalValue: 'Negative' },
      { key: 'sugar', label: 'Sugar', group: 'Chemical Examination', control: 'select', options: negativeOptions, normalValue: 'Negative' },
      { key: 'pus_cells', label: 'Pus Cells', group: 'Microscopic Examination', control: 'text', unit: '/HPF', normal: '0-4 /HPF', normalValue: '0-2' },
      { key: 'red_blood_cells', label: 'Red Blood Cells', group: 'Microscopic Examination', control: 'text', unit: '/HPF', normal: '0-2 /HPF', normalValue: '0-2' },
      { key: 'epithelial_cells', label: 'Epithelial Cells', group: 'Microscopic Examination', control: 'select', options: frequencyOptions, normalValue: 'Occasional' },
      { key: 'mucous_threads', label: 'Mucous Threads', group: 'Microscopic Examination', control: 'select', options: frequencyOptions, normalValue: 'None' },
      { key: 'bacteria', label: 'Bacteria', group: 'Microscopic Examination', control: 'select', options: frequencyOptions, normalValue: 'Rare' },
      { key: 'calcium_oxalate', label: 'Calcium Oxalate', group: 'Crystals and Casts', control: 'select', options: frequencyOptions, normalValue: 'None' },
      { key: 'yeast_cells', label: 'Yeast Cells', group: 'Crystals and Casts', control: 'select', options: frequencyOptions, normalValue: 'None' },
      { key: 'hyaline_cast', label: 'Hyaline Cast', group: 'Crystals and Casts', control: 'select', options: frequencyOptions, normalValue: 'None' },
    ],
  },
  fecalysis: {
    version: 1,
    label: 'Fecalysis',
    fields: [
      { key: 'color', label: 'Color', group: 'Physical Properties', control: 'select', options: ['Brown', 'Yellow Brown', 'Dark Brown', 'Green', 'Black', 'Other'], normalValue: 'Brown' },
      { key: 'consistency', label: 'Consistency', group: 'Physical Properties', control: 'select', options: ['Formed', 'Soft', 'Loose', 'Watery', 'Mucoid'], normalValue: 'Formed' },
      { key: 'parasites', label: 'Parasites / Ova', group: 'Microscopic Examination', control: 'text', normalValue: 'No ova or parasite seen' },
    ],
  },
  serology: {
    version: 1,
    label: 'Serology',
    fields: [
      { key: 'hbsag_surface_antigen', label: 'HBsAg Surface Antigen', group: 'Screening', control: 'select', options: ['Non-reactive', 'Reactive'], normalValue: 'Non-reactive' },
      { key: 'anti_hav_igm', label: 'Anti-HAV IgM', group: 'Screening', control: 'select', options: ['Non-reactive', 'Reactive', 'N/A'], normalValue: 'Non-reactive' },
    ],
  },
  xray: {
    version: 1,
    label: 'Diagnostic Examination / X-ray',
    fields: [
      { key: 'findings', label: 'Findings', group: 'Chest X-ray', control: 'textarea', normalValue: 'Normal chest findings.' },
      { key: 'impression', label: 'Impression', group: 'Chest X-ray', control: 'textarea', normalValue: 'Normal chest findings.' },
    ],
  },
  drug_test: {
    version: 1,
    label: 'Drug Test',
    fields: [
      { key: 'methamphetamine', label: 'Methamphetamine', group: 'Screening', control: 'select', options: ['Negative', 'Positive'], normalValue: 'Negative' },
      { key: 'tetrahydrocannabinol', label: 'THC / Cannabis', group: 'Screening', control: 'select', options: ['Negative', 'Positive'], normalValue: 'Negative' },
      { key: 'remarks', label: 'Remarks', group: 'Screening', control: 'textarea' },
    ],
  },
  ecg: {
    version: 1,
    label: 'ECG',
    fields: [
      { key: 'findings', label: 'Findings', group: 'ECG Interpretation', control: 'textarea', normalValue: 'Normal sinus rhythm.' },
      { key: 'impression', label: 'Impression', group: 'ECG Interpretation', control: 'textarea', normalValue: 'Normal ECG.' },
    ],
  },
};

export function getNormalPayload(testType: string) {
  const template = examinationTemplates[testType];
  if (!template) return {};
  return Object.fromEntries(template.fields.filter((field) => field.normalValue).map((field) => [field.key, field.normalValue]));
}

export function isAbnormalResult(field: ExaminationField, value: unknown) {
  if (value === '' || value === null || value === undefined) return false;
  if (field.control === 'number' && (field.min !== undefined || field.max !== undefined)) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return false;
    return (field.min !== undefined && numeric < field.min) || (field.max !== undefined && numeric > field.max);
  }
  if (field.normalValue && typeof value === 'string') return value.toLowerCase() !== field.normalValue.toLowerCase();
  return false;
}
