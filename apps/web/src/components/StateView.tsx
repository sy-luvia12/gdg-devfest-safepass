import type { ReactNode } from 'react';
import { AlertCircle, Check, Inbox, Loader2 } from 'lucide-react';
import { cx } from './cx';

type Props = {
  kind: 'loading' | 'empty' | 'error' | 'success';
  title?: string;
  description?: string;
  action?: ReactNode;
  fullScreen?: boolean;
};

const defaults = {
  success: { icon: Check, title: '완료됐어요' },
  loading: { icon: Loader2, title: '불러오는 중이에요' },
  empty: { icon: Inbox, title: '아직 아무것도 없어요' },
  error: { icon: AlertCircle, title: '문제가 생겼어요' },
};

/** 모든 화면 공통 로딩 / 빈 상태 / 에러 상태 */
export function StateView({ kind, title, description, action, fullScreen }: Props) {
  const d = defaults[kind];
  const Icon = d.icon;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex flex-col items-center justify-center gap-3 px-5 py-16 text-center',
        fullScreen && 'min-h-dvh',
      )}
    >
      <div
        className={cx(
          'flex h-14 w-14 items-center justify-center rounded-full',
          kind === 'error' ? 'bg-danger-bg text-danger' : kind === 'success' ? 'bg-success-bg text-success' : 'bg-surface text-ink-2',
        )}
      >
        <Icon size={24} strokeWidth={1.75} className={kind === 'loading' ? 'animate-spin' : undefined} />
      </div>
      <p className="text-heading text-ink">{title ?? d.title}</p>
      {description && <p className="max-w-[280px] text-caption text-ink-2">{description}</p>}
      {action && <div className="mt-3 w-full max-w-[280px]">{action}</div>}
    </div>
  );
}
