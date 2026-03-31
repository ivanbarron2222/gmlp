import { statusColors, statusLabels, Status } from '@/lib/status-utils';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = statusColors[status];
  const label = statusLabels[status];

  return (
    <Badge className={`${colors.bg} ${colors.text} border ${colors.border} font-medium`}>
      {label}
    </Badge>
  );
}
