import type { AppIcon } from '@/components/icons';
import { cx } from './cx';

type Props = {
  icon: AppIcon;
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
        'flex h-10 w-10 items-center justify-center rounded-full bg-bg text-ink-2 shadow-soft transition duration-200 ease-out hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-2 active:scale-95 active:bg-surface-2',
        className,
      )}
    >
      <Icon size={20} strokeWidth={1.75} />
    </button>
  );
}
