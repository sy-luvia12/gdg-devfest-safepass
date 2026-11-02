import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  suffix?: string;
};

export function TextField({ label, hint, error, suffix, className, ...rest }: Props) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-label text-ink-2">
        {label}
      </label>
      <div
        className={cx(
          'flex h-[52px] items-center rounded-md border-[1.5px] px-4 transition duration-200 ease-out',
          error
            ? 'border-danger bg-bg'
            : 'border-transparent bg-surface focus-within:border-lavender focus-within:bg-bg',
        )}
      >
        <input
          id={id}
          aria-invalid={!!error}
          className="h-full w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          {...rest}
        />
        {suffix && <span className="ml-2 shrink-0 text-body text-ink-2">{suffix}</span>}
      </div>
      {error ? (
        <p className="text-caption text-danger">{error}</p>
      ) : (
        hint && <p className="text-caption text-ink-2">{hint}</p>
      )}
    </div>
  );
}
