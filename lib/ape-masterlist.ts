export type ParsedMasterlistPatient = {
  rowNumber: number;
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string | null;
  age: string;
  gender: string;
  department: string;
  contactNumber: string;
  emailAddress: string;
  rawPayload: Record<string, unknown>;
};

const FIRST_NAME_KEYS = ['first name', 'firstname', 'given name', 'givenname'];
const MIDDLE_NAME_KEYS = ['middle name', 'middlename', 'middle initial', 'mi'];
const LAST_NAME_KEYS = ['last name', 'lastname', 'surname', 'family name'];
const FULL_NAME_KEYS = ['name', 'full name', 'fullname', 'patient name'];
const BIRTH_DATE_KEYS = ['birth date', 'birthdate', 'birthday', 'date of birth', 'dob'];
const AGE_KEYS = ['age'];
const GENDER_KEYS = ['gender', 'sex'];
const DEPARTMENT_KEYS = ['department', 'course', 'section', 'address', 'company'];
const CONTACT_KEYS = ['contact', 'contact number', 'mobile', 'phone'];
const EMAIL_KEYS = ['email', 'email address'];

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function readValue(row: Record<string, unknown>, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);
  for (const key of keys) {
    const match = normalizedEntries.find(([rowKey]) => rowKey === key);
    if (match) {
      return String(match[1] ?? '').trim();
    }
  }
  return '';
}

function splitFullName(fullName: string) {
  const parts = fullName.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);
  if (fullName.includes(',')) {
    const [lastNamePart, restPart] = fullName.split(',');
    const rest = restPart?.trim().split(/\s+/).filter(Boolean) ?? [];
    return {
      firstName: rest[0] ?? '',
      middleName: rest.slice(1).join(' '),
      lastName: lastNamePart.trim(),
    };
  }

  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function normalizeDate(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function normalizeMasterlistRows(rows: Record<string, unknown>[]): ParsedMasterlistPatient[] {
  return rows
    .map((row, index) => {
      const fullName = readValue(row, FULL_NAME_KEYS);
      const nameParts = fullName ? splitFullName(fullName) : { firstName: '', middleName: '', lastName: '' };
      const firstName = readValue(row, FIRST_NAME_KEYS) || nameParts.firstName;
      const middleName = readValue(row, MIDDLE_NAME_KEYS) || nameParts.middleName;
      const lastName = readValue(row, LAST_NAME_KEYS) || nameParts.lastName;

      return {
        rowNumber: index + 1,
        firstName,
        middleName,
        lastName,
        birthDate: normalizeDate(readValue(row, BIRTH_DATE_KEYS)),
        age: readValue(row, AGE_KEYS),
        gender: readValue(row, GENDER_KEYS),
        department: readValue(row, DEPARTMENT_KEYS),
        contactNumber: readValue(row, CONTACT_KEYS),
        emailAddress: readValue(row, EMAIL_KEYS),
        rawPayload: row,
      };
    })
    .filter((row) => row.firstName && row.lastName);
}

export function buildLabOrderNumber(sequenceNumber: number) {
  return `LAB-${String(sequenceNumber).padStart(3, '0')}`;
}
