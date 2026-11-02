import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; className?: string };

/** 높이 64px, 아이템 사이 구분선 (DESIGN.md 5장) */
export function ListItem({ leading, title, subtitle, trailing, className }: Props) {
  return (
    <div className={cx('flex min-h-16 items-center gap-3 border-b border-line py-3 last:border-b-0', className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body text-ink">{title}</div>
        {subtitle && <div className="truncate text-caption text-ink-2">{subtitle}</div>}
      </div>
      {trailing}
    </div>
  );
}
