import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type PatientRecordPdfRow = {
  queueNumber: string;
  patientName: string;
  patientCode: string;
  serviceType: string;
  currentLane: string;
  visitStatus: string;
  labNumber: string;
  createdAt: string;
};

type PatientRecordsPdfOptions = {
  rows: PatientRecordPdfRow[];
  startDate?: string;
  endDate?: string;
};

function formatDateLabel(value?: string) {
  if (!value) {
    return 'Any';
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export async function generatePatientRecordsPdf({
  rows,
  startDate,
  endDate,
}: PatientRecordsPdfOptions) {
  const pdf = await PDFDocument.create();
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  let page = pdf.addPage([pageWidth, pageHeight]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(15 / 255, 23 / 255, 42 / 255);
  const muted = rgb(100 / 255, 116 / 255, 139 / 255);
  const border = rgb(203 / 255, 213 / 255, 225 / 255);
  const blue = rgb(11 / 255, 101 / 255, 177 / 255);

  const margin = 36;
  const tableStartX = margin;
  const columns = [
    { key: 'queueNumber', label: 'Queue', width: 64 },
    { key: 'patientName', label: 'Patient', width: 180 },
    { key: 'patientCode', label: 'Patient ID', width: 110 },
    { key: 'serviceType', label: 'Service', width: 86 },
    { key: 'currentLane', label: 'Lane', width: 86 },
    { key: 'visitStatus', label: 'Status', width: 86 },
    { key: 'labNumber', label: 'Lab No.', width: 92 },
    { key: 'createdAt', label: 'Created', width: 150 },
  ] as const;

  let y = pageHeight - margin;

  const drawHeader = () => {
    page.drawText('GLOBALIFE MEDICAL LABORATORY & POLYCLINIC', {
      x: tableStartX,
      y,
      size: 15,
      font: boldFont,
      color: blue,
    });
    y -= 22;

    page.drawText('Patient Records List', {
      x: tableStartX,
      y,
      size: 20,
      font: boldFont,
      color: dark,
    });
    y -= 18;

    page.drawText(
      `Date Filter: ${formatDateLabel(startDate)} to ${formatDateLabel(endDate)} | Total Visits: ${rows.length}`,
      {
        x: tableStartX,
        y,
        size: 9,
        font,
        color: muted,
      }
    );
    y -= 10;

    page.drawText(
      `Generated: ${new Date().toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`,
      {
        x: tableStartX,
        y,
        size: 9,
        font,
        color: muted,
      }
    );
    y -= 22;

    let x = tableStartX;
    for (const column of columns) {
      page.drawRectangle({
        x,
        y: y - 18,
        width: column.width,
        height: 18,
        borderColor: border,
        borderWidth: 0.8,
      });
      page.drawText(column.label, {
        x: x + 4,
        y: y - 12,
        size: 8.5,
        font: boldFont,
        color: dark,
      });
      x += column.width;
    }
    y -= 18;
  };

  const truncateText = (value: string, maxChars: number) => {
    if (value.length <= maxChars) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
  };

  drawHeader();

  rows.forEach((row) => {
    if (y < margin + 24) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }

    const values: Record<(typeof columns)[number]['key'], string> = {
      queueNumber: row.queueNumber || 'N/A',
      patientName: truncateText(row.patientName || 'N/A', 32),
      patientCode: truncateText(row.patientCode || 'N/A', 18),
      serviceType: truncateText(row.serviceType || 'N/A', 16),
      currentLane: truncateText(row.currentLane || 'N/A', 14),
      visitStatus: truncateText(row.visitStatus || 'N/A', 16),
      labNumber: truncateText(row.labNumber || 'N/A', 14),
      createdAt: truncateText(row.createdAt || 'N/A', 24),
    };

    let x = tableStartX;
    for (const column of columns) {
      page.drawRectangle({
        x,
        y: y - 18,
        width: column.width,
        height: 18,
        borderColor: border,
        borderWidth: 0.6,
      });
      page.drawText(values[column.key], {
        x: x + 4,
        y: y - 12,
        size: 8,
        font,
        color: dark,
      });
      x += column.width;
    }

    y -= 18;
  });

  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
