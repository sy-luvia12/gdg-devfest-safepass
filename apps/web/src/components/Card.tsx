import type { HTMLAttributes } from 'react';
import { cx } from './cx';

type Props = HTMLAttributes<HTMLDivElement> & { padded?: boolean };

export function Card({ padded = true, className, ...rest }: Props) {
  return <div className={cx('rounded-lg border border-line bg-bg', padded && 'p-5', className)} {...rest} />;
}
