import type { MachineResultItem } from '@/lib/patient-record-types';

export interface ParsedMachineResult {
  orderId: string;
  patientName: string;
  testName: string;
  results: MachineResultItem[];
}

function cleanup(value: string) {
  return value.trim();
}

function normalizeQualitativeValue(value: string) {
  const normalized = cleanup(value).toUpperCase();

  switch (normalized) {
    case 'NEG':
    case 'NEGATIVE':
      return 'Negative';
    case 'POS':
    case 'POSITIVE':
      return 'Positive';
    case 'REACTIVE':
      return 'Reactive';
    case 'NONREACTIVE':
    case 'NON-REACTIVE':
      return 'Non-Reactive';
    default:
      return cleanup(value);
  }
}

function parseStructuredResultLine(line: string): MachineResultItem | null {
  const parts = line.split('|');

  if (parts[0] !== 'R') {
    return null;
  }

  const analyteParts = (parts[2] ?? '').split('^').filter(Boolean);
  const shortName = cleanup(analyteParts[0] ?? '');
  const longName = cleanup(analyteParts[1] ?? '');
  const value = normalizeQualitativeValue(parts[4] ?? '');
  const unit = cleanup(parts[5] ?? '');
  const referenceRange = cleanup(parts[6] ?? '');
  const flag = cleanup(parts[7] ?? '');

  if (!shortName || !value) {
    return null;
  }

  return {
    name: longName ? `${shortName} (${longName})` : shortName,
    value,
    unit,
    referenceRange,
    flag,
  };
}

function parseSimpleResultLine(line: string): MachineResultItem | null {
  const match = line.match(/^([A-Za-z0-9+\-()/ ]+):\s*([^()]+?)(?:\s+\(([^)]+)\))?$/);

  if (!match) {
    return null;
  }

  const [, rawName, rawValueAndUnit, rawReference] = match;
  const valueAndUnit = normalizeQualitativeValue(rawValueAndUnit);
  const unitMatch = valueAndUnit.match(/^([-+]?\d*\.?\d+)\s*(.*)$/);

  return {
    name: cleanup(rawName),
    value: cleanup(unitMatch?.[1] ?? valueAndUnit),
    unit: cleanup(unitMatch?.[2] ?? ''),
    referenceRange: cleanup(rawReference ?? ''),
    flag: '',
  };
}

export function parseMachineResultText(text: string): ParsedMachineResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const orderId =
    lines.find((line) => /^SampleID:/i.test(line))?.split(':').slice(1).join(':').trim() ||
    lines.find((line) => /^Order\s*ID:/i.test(line))?.split(':').slice(1).join(':').trim() ||
    lines.find((line) => line.startsWith('O|'))?.split('|')[2]?.trim() ||
    'UNSPECIFIED-ORDER';

  const patientName =
    lines.find((line) => /^Patient:/i.test(line))?.split(':').slice(1).join(':').trim() ||
    lines.find((line) => line.startsWith('P|'))?.split('|')[5]?.replace(/\^/g, ' ').trim() ||
    'Unknown Patient';

  const testName =
    lines.find((line) => /^Test:/i.test(line))?.split(':').slice(1).join(':').trim() ||
    lines.find((line) => line.startsWith('O|'))?.split('|')[4]?.trim() ||
    'Laboratory Test';

  const parsedResults = lines
    .map((line) => parseStructuredResultLine(line) ?? parseSimpleResultLine(line))
    .filter((item): item is MachineResultItem => Boolean(item));

  return {
    orderId,
    patientName,
    testName,
    results: parsedResults,
  };
}
