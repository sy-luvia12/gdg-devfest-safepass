import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Circle, Clock, CopyX, HelpCircle } from 'lucide-react';
import type { ScanResult } from '@/types';
import { cx } from './cx';

export type BadgeKind = 'issued' | 'available' | 'used' | 'expiring' | ScanResult;

const styles: Record<BadgeKind, { cls: string; icon: LucideIcon; text: string }> = {
  issued: { cls: 'bg-surface text-ink-2', icon: Circle, text: '발급됨' },
  available: { cls: 'bg-success-bg text-success', icon: CheckCircle2, text: '사용 가능' },
  used: { cls: 'bg-surface-2 text-ink-3', icon: CheckCircle2, text: '사용됨' },
  expiring: { cls: 'bg-warning-bg text-warning', icon: Clock, text: '만료 임박' },
  ok: { cls: 'bg-success-bg text-success', icon: CheckCircle2, text: '입장' },
  expired: { cls: 'bg-warning-bg text-warning', icon: Clock, text: '만료' },
  invalid: { cls: 'bg-surface-2 text-ink-3', icon: HelpCircle, text: '확인 불가' },
};

// ScanResult 'used'는 관리자 기록에서 "중복"으로 보여준다
const scanUsed = { cls: 'bg-danger-bg text-danger', icon: CopyX, text: '중복' };

type Props = { kind: BadgeKind; scan?: boolean; className?: string };

export function StatusBadge({ kind, scan, className }: Props) {
  const s = scan && kind === 'used' ? scanUsed : styles[kind];
  const Icon = s.icon;
  return (
    <span
      className={cx('inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-label', s.cls, className)}
    >
      <Icon size={14} strokeWidth={1.75} />
      {s.text}
    </span>
  );
}
