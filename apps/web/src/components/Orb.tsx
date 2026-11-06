import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

/** size: px 숫자, 또는 화면 높이에 맞춰 줄어들게 'min(200px, 24dvh)' 같은 CSS 길이 */
type Props = { size?: number | string; tone?: 'orb' | 'success' | 'warm'; children?: ReactNode; className?: string };

const tones = { success: 'bg-grad-success', warm: 'bg-grad-warm' };

/**
 * 테마 색(--c-p1~p4)을 유지하는 비대칭 안개 (DESIGN.md 5장).
 * 기본(orb)은 원형 경계 없이 여러 레이어가 천천히 흐른다.
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
      className={cx('orb relative flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size, '--orb-size': typeof size === 'number' ? `${size}px` : size } as CSSProperties}
    >
      <div className="orb-halo" aria-hidden />
      <div className="orb-body" aria-hidden>
        <div className="orb-swirl" />
        <div className="orb-band" />
        <div className="orb-glow" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** 기존 Orb 안개를 넓고 옅은 상단 배경으로 재사용한다. */
export function PageAtmosphere() {
  return (
    <div aria-hidden="true" className="page-atmosphere">
      <Orb size={680} className="page-atmosphere-cloud" />
    </div>
  );
}
