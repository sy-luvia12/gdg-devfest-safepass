import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

type Props = { size?: number; tone?: 'orb' | 'success' | 'warm'; children?: ReactNode; className?: string };

const tones = { success: 'bg-grad-success', warm: 'bg-grad-warm' };

/**
 * 원형 블롭 (DESIGN.md 5장).
 * 기본(orb)은 테마 색(--c-p1~p4)으로 만든 안개 같은 구: 바깥 번짐 + 천천히 도는 핑크·보라 소용돌이 + 흐린 가장자리.
 * 상태 표시(success·warm)는 예전처럼 단순한 그라데이션 원.
 */
export function Orb({ size = 180, tone = 'orb', children, className }: Props) {
  if (tone !== 'orb') {
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

  return (
    <div
      className={cx('orb relative flex shrink-0 items-center justify-center animate-breathe', className)}
      style={{ width: size, height: size, '--orb-size': `${size}px` } as CSSProperties}
    >
      <div className="orb-halo" aria-hidden />
      <div className="orb-body" aria-hidden>
        <div className="orb-swirl" />
        <div className="orb-band" />
        <div className="orb-glow" />
      </div>
      <div className="orb-rim" aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );
}
