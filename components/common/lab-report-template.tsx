import { cn } from '@/lib/utils';

export interface LabReportPatientInfo {
  name: string;
  patientNumber: string;
  company: string;
  age?: string;
  sex: string;
  birthDate: string;
  address: string;
  date: string;
}

export interface LabReportRow {
  key?: string;
  type?: 'result' | 'group';
  test: string;
  normalValues?: string;
  result?: string;
  flag?: 'normal' | 'abnormal';
}

export interface LabReportSection {
  title: string;
  rows: LabReportRow[];
}

export interface LabReportNarrative {
  title: string;
  body: string[];
  impression?: string;
}

export interface LabReportTemplateData {
  reportTitle: string;
  softCopyQrDataUrl?: string;
  patient: LabReportPatientInfo;
  sections: LabReportSection[];
  xray?: LabReportNarrative;
  medicalExam?: {
    diagnosis: string[];
    recommendation: string[];
  };
  signatures: Array<{
    name: string;
    role: string;
    license?: string;
  }>;
}

function computeAgeFromBirthDate(birthDate: string) {
  if (!birthDate || birthDate.startsWith('[')) {
    return '';
  }

  const parsedDate = new Date(birthDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const today = new Date();
  let age = today.getFullYear() - parsedDate.getFullYear();
  const monthDiff = today.getMonth() - parsedDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsedDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? String(age) : '';
}

export function LabReportTemplate({ data, className }: { data: LabReportTemplateData; className?: string }) {
  const computedAge = computeAgeFromBirthDate(data.patient.birthDate) || data.patient.age || '[AGE]';

  return (
    <div className={cn('lab-report mx-auto w-full max-w-[794px] bg-white font-serif text-slate-900', className)}>
      <div className="lab-report__sheet relative overflow-hidden border border-[#cfd8cf]">
        <div className="lab-report__watermark absolute inset-0 flex items-center justify-center opacity-[0.04]">
          <div className="lab-report__watermark-ring h-[470px] w-[470px] rounded-full border-[22px] border-[#0b65b1]" />
        </div>

        <div className="lab-report__content relative px-7 pb-6 pt-5">
          <header className="lab-report__header border-b-2 border-[#0b65b1] pb-3 text-center">
            <div className="lab-report__header-row flex items-start justify-between gap-4">
              <div className="lab-report__logo mt-0.5 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#0b65b1] text-[9px] font-black leading-tight text-[#0b65b1]">
                GMLP
              </div>
              <div className="lab-report__header-main flex-1">
                <p className="lab-report__eyebrow text-[9px] font-semibold uppercase tracking-[0.28em] text-[#0b65b1]">
                  Globalife Medical Laboratory &amp; Polyclinic
                </p>
                <h1 className="lab-report__title mt-1 text-[28px] font-black uppercase tracking-tight text-[#0b65b1]">
                  {data.reportTitle}
                </h1>
                <p className="lab-report__tagline mt-1 text-[15px] italic text-[#0b65b1]">
                  Quality, Accuracy, Integrity &amp; Compassionate Service
                </p>
                <p className="lab-report__contact mt-2 text-[10px] leading-snug text-slate-600">
                  General Trias Drive, Tejero, Rosario, Cavite
                  <br />
                  Tel. No. 046-437-9463 • Mobile 0928-668-2525 • Email globalife@example.com
                </p>
              </div>
              <div className="lab-report__qr flex w-[76px] shrink-0 flex-col items-center">
                {data.softCopyQrDataUrl ? (
                  <img
                    src={data.softCopyQrDataUrl}
                    alt="Soft copy QR"
                    className="h-[68px] w-[68px] border border-slate-300 bg-white p-1"
                  />
                ) : (
                  <div className="lab-report__qr-placeholder h-[68px] w-[68px] border border-dashed border-slate-300 bg-white" />
                )}
                <p className="lab-report__qr-label mt-1 text-center text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Soft Copy
                </p>
              </div>
            </div>
          </header>

          <section className="lab-report__patient-section mt-3 border border-slate-700">
            <div className="lab-report__patient-row grid grid-cols-[1.45fr_1fr] border-b border-slate-400">
              <div className="lab-report__patient-cell-grid grid grid-cols-[82px_1fr] border-r border-slate-400">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Name:</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px] font-semibold">{data.patient.name}</div>
              </div>
              <div className="lab-report__patient-cell-grid grid grid-cols-[58px_1fr]">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Date</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px] font-semibold">{data.patient.date}</div>
              </div>
            </div>

            <div className="lab-report__patient-row grid grid-cols-[1.45fr_1fr] border-b border-slate-400">
              <div className="lab-report__patient-cell-grid grid grid-cols-[82px_1fr] border-r border-slate-400">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Address</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px]">{data.patient.address}</div>
              </div>
              <div className="lab-report__patient-cell-grid grid grid-cols-[78px_1fr]">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Patient no:</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px] font-semibold">{data.patient.patientNumber}</div>
              </div>
            </div>

            <div className="lab-report__patient-row grid grid-cols-4">
              <div className="lab-report__patient-cell-grid grid grid-cols-[74px_1fr] border-r border-slate-400">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Company:</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px] font-semibold">{data.patient.company}</div>
              </div>
              <div className="lab-report__patient-cell-grid grid grid-cols-[86px_1fr] border-r border-slate-400">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Age / Gender:</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px] font-semibold">
                  {computedAge} / {data.patient.sex}
                </div>
              </div>
              <div className="lab-report__patient-cell-grid grid grid-cols-[76px_1fr] border-r border-slate-400">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Birth Date:</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px]">{data.patient.birthDate}</div>
              </div>
              <div className="lab-report__patient-cell-grid grid grid-cols-[58px_1fr]">
                <div className="lab-report__label border-r border-slate-400 px-2 py-0.5 text-[11px] font-bold">Report:</div>
                <div className="lab-report__value px-2 py-0.5 text-[11px]">{data.reportTitle}</div>
              </div>
            </div>
          </section>

          <section className="lab-report__section-grid mt-4 grid grid-cols-2 border border-slate-700">
            {data.sections.map((section, index) => (
              <div
                key={section.title}
                className={cn(
                  'lab-report__panel min-h-[230px]',
                  index % 2 === 0 ? 'border-r border-slate-700' : '',
                  index < 2 ? 'border-b border-slate-700' : ''
                )}
              >
                <div className="lab-report__panel-title border-b border-slate-700 px-4 py-1 text-center text-[15px] font-black uppercase leading-none tracking-tight">
                  {section.title}
                </div>
                <table className="lab-report__table w-full border-collapse text-[12px] leading-tight">
                  <thead>
                    <tr className="lab-report__table-head border-b border-slate-700">
                      <th className="lab-report__th border-r border-slate-400 px-1.5 py-0.5 text-left font-bold">Test</th>
                      <th className="lab-report__th border-r border-slate-400 px-1.5 py-0.5 text-left font-bold">Normal Values</th>
                      <th className="lab-report__th px-1.5 py-0.5 text-left font-bold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.length > 0 ? (
                      section.rows.map((row, index) => (
                        row.type === 'group' ? (
                          <tr
                            key={row.key ?? `${section.title}-${row.test}-${index}`}
                            className="lab-report__tr align-top last:border-b-0"
                          >
                            <td colSpan={3} className="lab-report__td px-1.5 py-1 align-top font-bold">
                              {row.test}
                            </td>
                          </tr>
                        ) : (
                          <tr
                            key={row.key ?? `${section.title}-${row.test}-${index}`}
                            className="lab-report__tr align-top last:border-b-0"
                          >
                            <td className="lab-report__td border-r border-slate-300 px-1.5 py-0.5 align-top font-medium">{row.test}</td>
                            <td className="lab-report__td border-r border-slate-300 px-1.5 py-0.5 align-top">{row.normalValues || ''}</td>
                            <td
                              className={cn(
                                'lab-report__td px-1.5 py-0.5 align-top font-semibold',
                                row.flag === 'abnormal' ? 'text-red-700' : 'text-slate-900'
                              )}
                            >
                              {row.result || ''}
                            </td>
                          </tr>
                        )
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="lab-report__empty px-3 py-8 text-center text-[12px] text-slate-400">
                          No encoded data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          {data.xray && (
            <section className="lab-report__narrative mt-6 border border-slate-400 p-5">
              <h2 className="lab-report__narrative-title text-center text-2xl font-black uppercase tracking-wide">
                {data.xray.title}
              </h2>
              <div className="lab-report__narrative-body mt-5 space-y-2 text-[15px] leading-7">
                {data.xray.body.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              {data.xray.impression && (
                <div className="lab-report__impression mt-6">
                  <p className="lab-report__impression-label text-xl font-black uppercase">Impression</p>
                  <p className="lab-report__impression-text mt-2 text-lg font-bold uppercase">{data.xray.impression}</p>
                </div>
              )}
            </section>
          )}

          {data.medicalExam && (
            <section className="lab-report__medical mt-6 border border-slate-400 p-5">
              <div className="lab-report__medical-grid grid gap-6 xl:grid-cols-2">
                <div>
                  <h3 className="lab-report__medical-title text-lg font-black uppercase">Diagnosis</h3>
                  <ul className="lab-report__medical-list mt-3 space-y-2 text-sm leading-6">
                    {data.medicalExam.diagnosis.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="lab-report__medical-title text-lg font-black uppercase">Recommendation</h3>
                  <ul className="lab-report__medical-list mt-3 space-y-2 text-sm leading-6">
                    {data.medicalExam.recommendation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <footer className="lab-report__footer mt-6 grid gap-10 pt-5 text-center text-[12px] xl:grid-cols-2">
            {data.signatures.map((signature) => (
              <div key={signature.name} className="lab-report__signature mx-auto w-full max-w-[280px] border-t border-slate-600 pt-3">
                <p className="lab-report__signature-name font-bold">{signature.name}</p>
                <p className="lab-report__signature-role">{signature.role}</p>
                {signature.license && <p className="lab-report__signature-license">{signature.license}</p>}
              </div>
            ))}
          </footer>
        </div>
      </div>
    </div>
  );
}
