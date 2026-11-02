import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

type Props = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  className?: string;
};

export function IconButton({ icon: Icon, label, onClick, className }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        'flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-2 transition duration-200 ease-out active:scale-95 active:bg-surface-2',
        className,
      )}
    >
      <Icon size={20} strokeWidth={1.75} />
    </button>
  );
}
