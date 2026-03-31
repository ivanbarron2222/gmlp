import { Card } from '@/components/ui/card';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number | string;
  change?: number;
  critical?: boolean;
  icon?: React.ReactNode;
}

export function MetricCard({ label, value, change, critical, icon }: MetricCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <h3 className={`text-2xl font-bold ${critical ? 'text-destructive' : ''}`}>
              {value}
            </h3>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-xs font-semibold ${isPositive ? 'text-accent' : isNegative ? 'text-destructive' : ''}`}>
                {isPositive && <ArrowUp className="w-4 h-4" />}
                {isNegative && <ArrowDown className="w-4 h-4" />}
                {Math.abs(change)}%
              </div>
            )}
          </div>
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${critical ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
