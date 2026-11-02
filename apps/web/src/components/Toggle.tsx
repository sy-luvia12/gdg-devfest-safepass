import { useId } from 'react';
import { cx } from './cx';

type Props = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

/** 설정 켜고 끄기. 행 전체를 눌러도 바뀐다 */
export function Toggle({ label, description, checked, onChange, disabled }: Props) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex items-start gap-4', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">{label}</p>
        {description && <p className="mt-0.5 text-caption text-ink-2">{description}</p>}
      </div>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={cx(
            'h-7 w-12 rounded-full transition duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-lavender',
            checked ? 'bg-ink' : 'bg-surface-2',
          )}
        />
        <span
          className={cx(
            'absolute left-1 top-1 h-5 w-5 rounded-full bg-bg shadow-soft transition duration-200',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  );
}
