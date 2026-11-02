import type { ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'muted';

const tones: Record<BadgeTone, string> = {
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  neutral: 'bg-surface text-ink-2',
  muted: 'bg-surface-2 text-ink-3',
};

/** 범용 배지. 상태가 정해진 입장권·검표 결과는 StatusBadge를 쓴다 */
export function Badge({ tone, icon, children }: { tone: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx('inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-label', tones[tone])}>
      {icon}
      {children}
    </span>
  );
}
