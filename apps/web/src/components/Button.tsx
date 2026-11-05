import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** md: 52px 전체 폭 (기본) / sm: 40px 내용 폭 (관리자 헤더, 인라인 버튼) */
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary: 'bg-grad-button text-ink',
  secondary: 'bg-surface text-ink',
  ghost: 'bg-transparent text-ink-2',
};

const sizes = {
  md: 'h-[52px] w-full text-body',
  sm: 'h-10 px-4 text-label',
};

/** radius-full. 화면당 primary는 1개 (DESIGN.md 5장) */
export function Button({ variant = 'primary', size = 'md', loading, icon, disabled, className, children, ...rest }: Props) {
  const off = disabled || loading;
  return (
    <button
      type="button"
      disabled={off}
      className={cx(
        'flex shrink-0 items-center justify-center gap-2 rounded-full font-medium outline-none transition duration-200 ease-out focus-visible:ring-2 focus-visible:ring-lavender',
        sizes[size],
        off ? 'bg-surface text-ink-3' : cx(variants[variant], 'active:scale-[0.98] active:brightness-95'),
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={20} strokeWidth={1.75} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/**
 * 폰 영역 맨 아래에 붙는 버튼 묶음 (DESIGN.md 4.1). 내용과 같은 좌우 여백, 아래는 홈 인디케이터 + 20px 띄운다.
 * 페이지의 main 바깥(MobileLayout 바로 아래)에 둔다. 내용이 짧으면 맨 아래로 내려가고, 길면 스크롤해도 아래에 남는다
 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto w-full bg-gradient-to-t from-bg via-bg to-bg/0 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
