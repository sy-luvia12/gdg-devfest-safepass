import type { HTMLAttributes } from 'react';
import { cx } from './cx';

type Props = HTMLAttributes<HTMLDivElement> & { padded?: boolean };

export function Card({ padded = true, className, ...rest }: Props) {
  return <div className={cx('surface-card rounded-lg', padded && 'p-6', className)} {...rest} />;
}
