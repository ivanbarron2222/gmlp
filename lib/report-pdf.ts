import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { LabReportRow, LabReportSection, LabReportTemplateData } from '@/components/common/lab-report-template';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PDFFontLike = Awaited<ReturnType<PDFDocument['embedFont']>>;
type PDFPageLike = ReturnType<PDFDocument['addPage']>;
type Fonts = { font: PDFFontLike; bold: PDFFontLike; italic: PDFFontLike };

const dark = rgb(0.08, 0.08, 0.08);
const muted = rgb(0.45, 0.45, 0.45);
const line = rgb(0.48, 0.48, 0.48);
const orange = rgb(0.98, 0.56, 0.25);
const blue = rgb(0.04, 0.28, 0.68);

async function loadLogoImage(pdf: PDFDocument) {
  try {
    return await pdf.embedPng(await readFile(path.join(process.cwd(), 'public', 'gmlp_logo.png')));
  } catch {
    return null;
  }
}

function wrapText(text: string, maxLength: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawText(page: PDFPageLike, text: string, x: number, y: number, font: PDFFontLike, size = 7, color = dark) {
  page.drawText(text || '', { x, y, font, size, color });
}

function drawBox(page: PDFPageLike, x: number, y: number, width: number, height: number, fill?: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width, height, borderColor: line, borderWidth: 0.45, color: fill });
}

function drawSectionTitle(page: PDFPageLike, title: string, x: number, y: number, width: number, fonts: Fonts) {
  drawBox(page, x, y - 15, width, 15, orange);
  drawText(page, title.toUpperCase(), x + 6, y - 11, fonts.bold, 8.5);
  return y - 15;
}

function findSection(data: LabReportTemplateData, title: string) {
  return data.sections.find((section) => section.title.toLowerCase() === title.toLowerCase()) ?? { title, rows: [] };
}

function rowLookup(section: LabReportSection, ...labels: string[]) {
  const normalized = labels.map((label) => label.toLowerCase());
  return section.rows.find((row) => normalized.includes(row.test.toLowerCase()))?.result ?? '';
}

function drawRows(page: PDFPageLike, rows: LabReportRow[], x: number, y: number, width: number, fonts: Fonts, limit = 16) {
  const resultWidth = width * 0.35;
  const labelWidth = width - resultWidth;
  for (const row of rows.slice(0, limit)) {
    const height = 13;
    drawBox(page, x, y - height, labelWidth, height);
    drawBox(page, x + labelWidth, y - height, resultWidth, height);
    drawText(page, row.test, x + 4, y - 9, row.type === 'group' ? fonts.bold : fonts.font, 6.8);
    if (row.type !== 'group') {
      drawText(page, row.result || '', x + labelWidth + 4, y - 9, fonts.bold, 6.8, row.flag === 'abnormal' ? rgb(0.72, 0.08, 0.08) : dark);
    }
    y -= height;
  }
  return y;
}

function drawClassification(page: PDFPageLike, x: number, y: number, width: number, fonts: Fonts, data: LabReportTemplateData) {
  drawText(page, 'MEDICAL CLASSIFICATION', x + 36, y - 14, fonts.bold, 16);
  y -= 34;
  const lines = [
    '(  )  Class A: Fit for employment',
    '       No defect',
    '(  )  Class B: Fit for employment',
    '       Has correctable defect and offers no handicap to job applied for.',
    '',
    'Needs treatment of:',
    '(  ) Mild Anemia / Anemia',
    '(  ) Mild / Severe Urinary Tract Infection',
    '(  ) Hematuria',
    '(  ) Urine Sugar: Trace, +1, +2; Suggest Fasting Blood Sugar',
    '(  ) Hepa B Reactive; for Internal Medicine consultation',
    '(  ) External hemorrhoids',
    '(  ) Dental defects',
    '(  ) Poor vision',
    '(  ) Others: ______________________________',
    '',
    '(  )  Class C: For further evaluation of:',
    '(  ) BP Monitoring',
    '(  ) Hypertensive',
    '(  ) Low Blood Pressure',
    '(  ) ECG Findings / Cardiology consultation',
    '(  ) X-ray Findings (Pulmo. / Ortho.) consultation',
    '(  ) PTB: Minimal / Moderate / Extensive',
    '(  ) Pneumonia        (  ) Cardiomegaly',
    '(  ) Others: ______________________________',
    '(  ) PENDING',
    '(  ) Suggest Apicolordotic view',
    '(  ) No Stool Submitted',
  ];
  const extra = [...(data.medicalExam?.diagnosis ?? []), ...(data.medicalExam?.recommendation ?? [])];
  for (const item of [...lines, ...extra.map((value) => `(  ) ${value}`)].slice(0, 31)) {
    drawText(page, item, x + 6, y, item === 'Needs treatment of:' ? fonts.bold : fonts.font, item === 'Needs treatment of:' ? 7.5 : 7);
    y -= 12;
  }
}

function drawSignature(page: PDFPageLike, x: number, y: number, width: number, signature: LabReportTemplateData['signatures'][number] | undefined, fonts: Fonts) {
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.65, color: dark });
  drawText(page, signature?.name ?? '[NAME]', x + 8, y - 11, fonts.bold, 7);
  drawText(page, signature?.license ?? '[LICENSE NUMBER]', x + 8, y - 21, fonts.font, 6.3);
  drawText(page, signature?.role ?? '[ROLE]', x + 8, y - 31, fonts.font, 6.5);
}

export async function generateLabReportPdf(data: LabReportTemplateData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([841.89, 595.28]);
  const fonts: Fonts = {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const logo = await loadLogoImage(pdf);
  const margin = 15;

  if (logo) {
    page.drawImage(logo, { x: 18, y: 528, width: 135, height: 52 });
    page.drawImage(logo, { x: 290, y: 190, width: 235, height: 205, opacity: 0.08 });
  }
  drawText(page, 'GLOBALIFE MEDICAL LABORATORY & POLYCLINIC', 160, 557, fonts.bold, 18, blue);
  drawText(page, '9012 Jasmin Street, De Roman Subd., Daang Amaya 1, Tanza, Cavite', 534, 573, fonts.bold, 7);
  drawText(page, 'Tel. No. 489-1607 / 431-0733', 534, 560, fonts.bold, 7);
  drawText(page, 'globalife.medlab@yahoo.com.ph', 534, 547, fonts.font, 7, blue);
  page.drawLine({ start: { x: margin, y: 523 }, end: { x: 827, y: 523 }, thickness: 1, color: blue });

  const patientRows = [
    [`LAB. NO.: ${data.patient.patientNumber}`, `AGE: ${data.patient.age ?? ''}`],
    [`NAME: ${data.patient.name}`, `SEX: ${data.patient.sex}`],
    [`COMPANY: ${data.patient.company}`, `DATE: ${data.patient.date}`],
  ];
  let summaryY = 510;
  for (const [left, right] of patientRows) {
    drawText(page, left, 18, summaryY, fonts.bold, 7.5);
    drawText(page, right, 286, summaryY, fonts.bold, 7.5);
    summaryY -= 13;
  }

  const bodyTop = 466;
  const leftX = 15;
  const leftWidth = 202;
  const middleX = 219;
  const middleWidth = 229;
  const rightX = 450;
  const rightWidth = 377;
  const urinalysis = findSection(data, 'Urinalysis');
  const fecalysis = findSection(data, 'Fecalysis');
  const hematology = findSection(data, 'Hematology');
  const others = findSection(data, 'Others');

  let leftY = drawSectionTitle(page, 'Clinical Microscopy', leftX, bodyTop, leftWidth, fonts);
  drawText(page, 'ROUTINE URINALYSIS', leftX + 57, leftY - 11, fonts.bold, 7.5);
  leftY -= 15;
  leftY = drawRows(page, urinalysis.rows, leftX, leftY, leftWidth, fonts, 17);
  leftY -= 5;
  leftY = drawSectionTitle(page, 'Urine Pregnancy Test', leftX, leftY, leftWidth, fonts);
  drawBox(page, leftX, leftY - 19, leftWidth, 19);
  drawText(page, `RESULT: ${rowLookup(others, 'Urine Pregnancy Test', 'Pregnancy Test') || 'N/A'}`, leftX + 10, leftY - 13, fonts.bold, 7);
  leftY -= 24;
  leftY = drawSectionTitle(page, 'Fecalysis', leftX, leftY, leftWidth, fonts);
  drawRows(page, fecalysis.rows, leftX, leftY, leftWidth, fonts, 7);

  let middleY = drawSectionTitle(page, 'Hematology', middleX, bodyTop, middleWidth, fonts);
  drawText(page, 'COMPLETE BLOOD COUNT', middleX + 64, middleY - 11, fonts.bold, 7.5);
  middleY -= 15;
  middleY = drawRows(page, hematology.rows, middleX, middleY, middleWidth, fonts, 16);
  middleY -= 5;
  middleY = drawSectionTitle(page, 'Serology', middleX, middleY, middleWidth, fonts);
  middleY = drawRows(page, others.rows, middleX, middleY, middleWidth, fonts, 4);
  middleY -= 5;
  middleY = drawSectionTitle(page, 'Chest X-ray', middleX, middleY, middleWidth, fonts);
  drawBox(page, middleX, middleY - 40, middleWidth, 40);
  const impression = data.xray?.impression || data.xray?.body.join(' ') || 'N/A';
  wrapText(impression, 42).slice(0, 3).forEach((value, index) => drawText(page, value, middleX + 8, middleY - 13 - index * 10, fonts.bold, 6.8));

  drawClassification(page, rightX, 516, rightWidth, fonts, data);
  drawText(page, 'CERTIFICATION', rightX + 130, 70, fonts.bold, 8);
  drawText(page, 'This is to certify that I have examined the applicant / patient', rightX + 58, 58, fonts.font, 6.5);
  drawText(page, 'to the best of my knowledge and found the classification above.', rightX + 64, 48, fonts.font, 6.5);

  drawSignature(page, 28, 40, 160, data.signatures[0], fonts);
  drawSignature(page, 252, 40, 160, data.signatures[1], fonts);
  drawSignature(page, 603, 40, 160, data.xraySignature, fonts);

  return Buffer.from(await pdf.save());
}
