import { cx } from './cx';

type Props = { src?: string; alt: string; size?: number; className?: string };

export function Avatar({ src, alt, size = 40, className }: Props) {
  return src ? (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cx('shrink-0 rounded-full bg-surface object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      aria-label={alt}
      className={cx('flex shrink-0 items-center justify-center rounded-full bg-surface text-label text-ink-2', className)}
      style={{ width: size, height: size }}
    >
      {alt.slice(0, 1)}
    </div>
  );
}
