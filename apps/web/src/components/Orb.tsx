import type { ReactNode } from 'react';
import { cx } from './cx';

type Props = { size?: number; tone?: 'orb' | 'success' | 'warm'; children?: ReactNode; className?: string };

const tones = { orb: 'bg-grad-orb', success: 'bg-grad-success', warm: 'bg-grad-warm' };

/** 원형 블롭. 겹친 그라데이션으로 번짐 표현 (DESIGN.md 5장) */
export function Orb({ size = 180, tone = 'orb', children, className }: Props) {
  return (
    <div
      className={cx('relative flex shrink-0 items-center justify-center rounded-full animate-breathe', tones[tone], className)}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_70%_75%,rgba(255,255,255,0.55),transparent_55%)]" />
      <div className="relative">{children}</div>
    </div>
  );
}
