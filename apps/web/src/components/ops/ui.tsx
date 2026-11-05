// 운영진 콘솔 (/ops) 전용 검정 테마 기본 부품. 색은 tailwind의 ops 토큰만 쓴다
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { cx } from '../cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-ops-accent text-ops-bg hover:brightness-110',
  secondary: 'bg-ops-raised text-ops-ink hover:bg-ops-line',
  ghost: 'bg-transparent text-ops-ink-2 hover:text-ops-ink',
  danger: 'bg-transparent text-ops-bad hover:bg-ops-bad/10',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
};

export function OpsButton({ variant = 'secondary', size = 'sm', loading, icon, disabled, className, children, ...rest }: ButtonProps) {
  const off = disabled || loading;
  return (
    <button
      type="button"
      disabled={off}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-ops-accent',
        size === 'sm' ? 'h-9 px-3.5 text-label' : 'h-11 px-5 text-body',
        off ? 'cursor-not-allowed bg-ops-raised text-ops-ink-3' : variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function OpsInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-9 min-w-0 rounded-md border border-ops-line bg-ops-bg px-3 text-label text-ops-ink outline-none placeholder:text-ops-ink-3 focus:border-ops-accent',
        className,
      )}
      {...rest}
    />
  );
}

export function OpsPanel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg border border-ops-line bg-ops-panel', className)} {...rest} />;
}

export function OpsTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-ops-ink">{title}</h1>
        {description && <p className="text-label text-ops-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'ok' | 'bad' | 'warn' | 'muted' | 'accent';
const tones: Record<Tone, string> = {
  ok: 'bg-ops-ok/15 text-ops-ok',
  bad: 'bg-ops-bad/15 text-ops-bad',
  warn: 'bg-ops-warn/15 text-ops-warn',
  muted: 'bg-ops-raised text-ops-ink-2',
  accent: 'bg-ops-accent/15 text-ops-accent',
};

export function OpsBadge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-caption', tones[tone])}>{children}</span>;
}

/** 로딩 / 빈 상태 / 에러 상태 */
export function OpsState({ kind, title, action }: { kind: 'loading' | 'empty' | 'error'; title?: string; action?: ReactNode }) {
  const Icon = kind === 'loading' ? Loader2 : kind === 'error' ? AlertCircle : Inbox;
  const text = title ?? (kind === 'loading' ? '불러오는 중이에요' : kind === 'error' ? '문제가 생겼어요' : '아직 아무것도 없어요');
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex flex-col items-center gap-3 px-5 py-14 text-center">
      <Icon
        size={22}
        strokeWidth={1.75}
        className={cx(kind === 'loading' && 'animate-spin', kind === 'error' ? 'text-ops-bad' : 'text-ops-ink-3')}
      />
      <p className="text-label text-ops-ink-2">{text}</p>
      {action}
    </div>
  );
}

/** 저장 결과·오류 한 줄 */
export function OpsNotice({ tone, children }: { tone: 'ok' | 'bad' | 'muted'; children: ReactNode }) {
  return (
    <p
      role="status"
      className={cx(
        'rounded-md px-4 py-2.5 text-label',
        tone === 'ok' ? 'bg-ops-ok/10 text-ops-ok' : tone === 'bad' ? 'bg-ops-bad/10 text-ops-bad' : 'bg-ops-raised text-ops-ink-2',
      )}
    >
      {children}
    </p>
  );
}
