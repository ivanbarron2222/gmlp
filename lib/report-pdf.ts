import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { LabReportTemplateData } from '@/components/common/lab-report-template';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function wrapText(text: string, maxLength: number) {
  if (!text) {
    return [''];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

async function loadLogoImage(pdf: PDFDocument) {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'gmlp_logo.png');
    const logoBytes = await readFile(logoPath);
    return await pdf.embedPng(logoBytes);
  } catch {
    return null;
  }
}

function drawCenteredWatermark(
  page: PDFPageLike,
  logoImage: Awaited<ReturnType<typeof loadLogoImage>> | null
) {
  if (!logoImage) {
    return;
  }

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const watermarkSize = 300;
  const x = (pageWidth - watermarkSize) / 2;
  const y = (pageHeight - watermarkSize) / 2;

  page.drawImage(logoImage, {
    x,
    y,
    width: watermarkSize,
    height: watermarkSize,
    opacity: 0.14,
  });
}

function drawReportHeader(
  page: PDFPageLike,
  data: LabReportTemplateData,
  fonts: { font: PDFFontLike; boldFont: PDFFontLike },
  colors: { blue: ReturnType<typeof rgb>; dark: ReturnType<typeof rgb> },
  logoImage?: Awaited<ReturnType<typeof loadLogoImage>>
) {
  const { font, boldFont } = fonts;
  const { blue, dark } = colors;
  let y = 802;

  if (logoImage) {
    page.drawImage(logoImage, {
      x: 40,
      y: 740,
      width: 54,
      height: 54,
    });
  }

  page.drawText('GLOBALIFE MEDICAL LABORATORY & POLYCLINIC', {
    x: 102,
    y,
    size: 9,
    font: boldFont,
    color: blue,
  });
  y -= 24;

  page.drawText(data.reportTitle.toUpperCase(), {
    x: 105,
    y,
    size: 23,
    font: boldFont,
    color: blue,
  });
  y -= 18;

  page.drawText('Quality, Accuracy, Integrity & Compassionate Service', {
    x: 145,
    y,
    size: 12,
    font,
    color: blue,
  });
  y -= 16;

  page.drawText('General Trias Drive, Tejero, Rosario, Cavite', {
    x: 180,
    y,
    size: 9,
    font,
    color: dark,
  });
  y -= 12;

  page.drawText('Tel. No. 046-437-9463   Mobile 0928-668-2525   Email globalife@example.com', {
    x: 122,
    y,
    size: 8.5,
    font,
    color: dark,
  });
  y -= 18;

  page.drawLine({
    start: { x: 40, y },
    end: { x: 555, y },
    thickness: 1.5,
    color: blue,
  });

  return y - 24;
}

function drawPatientSummary(
  page: PDFPageLike,
  data: LabReportTemplateData,
  fonts: { font: PDFFontLike },
  colors: { dark: ReturnType<typeof rgb> },
  startY: number
) {
  const { font } = fonts;
  const { dark } = colors;
  let y = startY;

  const patientLines = [
    `Name: ${data.patient.name}`,
    `Patient No.: ${data.patient.patientNumber}`,
    `Company: ${data.patient.company}`,
    `Age / Gender: ${data.patient.age || ''} / ${data.patient.sex}`,
    `Birth Date: ${data.patient.birthDate}`,
    `Date: ${data.patient.date}`,
    `Address: ${data.patient.address}`,
  ];

  for (const line of patientLines) {
    for (const wrapped of wrapText(line, 75)) {
      page.drawText(wrapped, {
        x: 42,
        y,
        size: 10.5,
        font,
        color: dark,
      });
      y -= 13;
    }
  }

  return y - 6;
}

function drawSignatures(
  page: PDFPageLike,
  signatures: LabReportTemplateData['signatures'],
  fonts: { font: PDFFontLike; boldFont: PDFFontLike },
  colors: { dark: ReturnType<typeof rgb> },
  signatureY: number
) {
  const { font, boldFont } = fonts;
  const { dark } = colors;

  signatures.slice(0, 2).forEach((signature, index) => {
    const x = index === 0 ? 75 : 345;
    page.drawLine({
      start: { x, y: signatureY + 34 },
      end: { x: x + 170, y: signatureY + 34 },
      thickness: 0.7,
      color: dark,
    });
    page.drawText(signature.name, {
      x: x + 14,
      y: signatureY + 18,
      size: 10.5,
      font: boldFont,
      color: dark,
    });
    page.drawText(signature.role, {
      x: x + 42,
      y: signatureY + 4,
      size: 10,
      font,
      color: dark,
    });
    if (signature.license) {
      page.drawText(signature.license, {
        x: x + 34,
        y: signatureY - 10,
        size: 9.5,
        font,
        color: dark,
      });
    }
  });
}

type PDFFontLike = Awaited<ReturnType<PDFDocument['embedFont']>>;
type PDFPageLike = ReturnType<PDFDocument['addPage']>;

function drawSingleSignature(
  page: PDFPageLike,
  signature: NonNullable<LabReportTemplateData['xraySignature']>,
  fonts: { font: PDFFontLike; boldFont: PDFFontLike },
  colors: { dark: ReturnType<typeof rgb> },
  signatureY: number
) {
  const { font, boldFont } = fonts;
  const { dark } = colors;
  const x = 212;

  page.drawLine({
    start: { x, y: signatureY + 34 },
    end: { x: x + 170, y: signatureY + 34 },
    thickness: 0.7,
    color: dark,
  });
  page.drawText(signature.name, {
    x: x + 14,
    y: signatureY + 18,
    size: 10.5,
    font: boldFont,
    color: dark,
  });
  page.drawText(signature.role, {
    x: x + 42,
    y: signatureY + 4,
    size: 10,
    font,
    color: dark,
  });
  if (signature.license) {
    page.drawText(signature.license, {
      x: x + 34,
      y: signatureY - 10,
      size: 9.5,
      font,
      color: dark,
    });
  }
}

export async function generateLabReportPdf(data: LabReportTemplateData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const blue = rgb(11 / 255, 101 / 255, 177 / 255);
  const dark = rgb(15 / 255, 23 / 255, 42 / 255);
  const logoImage = await loadLogoImage(pdf);

  drawCenteredWatermark(page, logoImage);

  let y = drawReportHeader(page, data, { font, boldFont }, { blue, dark }, logoImage);
  y = drawPatientSummary(page, data, { font }, { dark }, y);

  for (const section of data.sections) {
    if (y < 145) {
      break;
    }

    page.drawRectangle({
      x: 40,
      y: y - 18,
      width: 515,
      height: 18,
      borderColor: dark,
      borderWidth: 0.8,
    });
    page.drawText(section.title.toUpperCase(), {
      x: 250 - section.title.length,
      y: y - 13,
      size: 11,
      font: boldFont,
      color: dark,
    });
    y -= 18;

    page.drawRectangle({
      x: 40,
      y: y - 16,
      width: 515,
      height: 16,
      borderColor: dark,
      borderWidth: 0.8,
    });
    page.drawText('Test', { x: 46, y: y - 11, size: 9.5, font: boldFont, color: dark });
    page.drawText('Normal Values', { x: 270, y: y - 11, size: 9.5, font: boldFont, color: dark });
    page.drawText('Result', { x: 462, y: y - 11, size: 9.5, font: boldFont, color: dark });
    y -= 16;

    const rows = section.rows.length > 0 ? section.rows : [{ test: 'No encoded data', normalValues: '', result: '' }];

    for (const row of rows.slice(0, 14)) {
      const isGroup = row.type === 'group';
      const rowHeight = isGroup ? 15 : 14;
      page.drawRectangle({
        x: 40,
        y: y - rowHeight,
        width: 515,
        height: rowHeight,
        borderColor: rgb(148 / 255, 163 / 255, 184 / 255),
        borderWidth: 0.4,
      });

      page.drawText(row.test, {
        x: 46,
        y: y - rowHeight + 4,
        size: 9,
        font: isGroup ? boldFont : font,
        color: dark,
      });

      if (!isGroup) {
        page.drawText(row.normalValues || '', {
          x: 270,
          y: y - rowHeight + 4,
          size: 9,
          font,
          color: dark,
        });
        page.drawText(row.result || '', {
          x: 462,
          y: y - rowHeight + 4,
          size: 9,
          font: boldFont,
          color: row.flag === 'abnormal' ? rgb(185 / 255, 28 / 255, 28 / 255) : dark,
        });
      }

      y -= rowHeight;
      if (y < 145) {
        break;
      }
    }

    y -= 8;
  }

  drawSignatures(page, data.signatures, { font, boldFont }, { dark }, 78);

  if (data.xray) {
    const xrayPage = pdf.addPage([595.28, 841.89]);
    drawCenteredWatermark(xrayPage, logoImage);

    let xrayY = drawReportHeader(xrayPage, data, { font, boldFont }, { blue, dark }, logoImage);

    xrayPage.drawText(data.xray.title.toUpperCase(), {
      x: 175,
      y: xrayY,
      size: 15,
      font: boldFont,
      color: dark,
    });
    xrayY -= 22;

    for (const line of data.xray.body) {
      for (const wrapped of wrapText(line, 78)) {
        xrayPage.drawText(wrapped, {
          x: 42,
          y: xrayY,
          size: 10.5,
          font,
          color: dark,
        });
        xrayY -= 18;
      }
      xrayY -= 2;
    }

    if (data.xray.impression) {
      xrayY -= 8;
      xrayPage.drawText('Impression', { x: 42, y: xrayY, size: 11, font: boldFont, color: dark });
      xrayY -= 18;
      for (const wrapped of wrapText(data.xray.impression, 78)) {
        xrayPage.drawText(wrapped, {
          x: 42,
          y: xrayY,
          size: 10.5,
          font: boldFont,
          color: dark,
        });
        xrayY -= 14;
      }
    }

    if (data.xraySignature) {
      drawSingleSignature(xrayPage, data.xraySignature, { font, boldFont }, { dark }, 78);
    }
  }

  return Buffer.from(await pdf.save());
}
