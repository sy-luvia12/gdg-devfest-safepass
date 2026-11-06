import type { AppIcon } from '@/components/icons';
import { Card } from './Card';

type Props = { icon: AppIcon; label: string; value: string };

export function StatCard({ icon: Icon, label, value }: Props) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-ink-2">
        <Icon size={20} strokeWidth={1.75} />
        <span className="text-label">{label}</span>
      </div>
      <p key={value} className="text-title tabular text-ink animate-rise-in">
        {value}
      </p>
    </Card>
  );
}
