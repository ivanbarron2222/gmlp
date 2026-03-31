import { Badge } from '@/components/ui/badge';
import { formatDOB, calculateAge } from '@/lib/formatting';

interface PatientHeaderProps {
  avatar?: string;
  firstName: string;
  lastName: string;
  patientId: string;
  age: number;
  gender: string;
  dateOfBirth: string;
  riskLevel?: 'normal-risk' | 'critical';
  doctorName?: string;
  doctorSpecialty?: string;
}

export function PatientHeader({
  avatar,
  firstName,
  lastName,
  patientId,
  age,
  gender,
  dateOfBirth,
  riskLevel = 'normal-risk',
  doctorName,
  doctorSpecialty,
}: PatientHeaderProps) {
  const dob = new Date(dateOfBirth);
  const riskColors = riskLevel === 'critical' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700';

  return (
    <div className="flex items-start gap-6 p-6 bg-background border border-border rounded-lg">
      {/* Avatar */}
      <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
        {avatar && <span className="text-sm font-bold text-primary">{avatar}</span>}
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-lg font-bold">
            {firstName.toUpperCase()} {lastName.toUpperCase()}
          </h2>
          <Badge className={`${riskColors} border-0`}>
            {riskLevel === 'critical' ? 'CRITICAL' : 'NORMAL RISK'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Patient ID: {patientId} • {age}Y / {gender} • DOB: {formatDOB(dob)}
        </p>
        {doctorName && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            {doctorName} {doctorSpecialty && `(${doctorSpecialty})`}
          </p>
        )}
      </div>
    </div>
  );
}
