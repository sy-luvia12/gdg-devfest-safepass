import { ChevronRight, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatPrice } from '@/app/format';
import type { TransferView } from '@/types';

/** 나에게 온 양도 요청 안내. 눌러서 받기 화면으로 */
export function IncomingTransferBanner({ transfers }: { transfers: TransferView[] }) {
  if (transfers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {transfers.map((t) => (
        <Link
          key={t.id}
          to={`/transfers/${t.id}`}
          className="flex items-center gap-3 rounded-lg border border-line bg-bg p-4 transition duration-200 active:bg-surface"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavender text-ink">
            <Gift size={20} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-ink">{t.fromName}님이 입장권을 보냈어요</span>
            <span className="block text-caption text-ink-2">
              {t.eventName} · {formatPrice(t.price)}
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-ink-3" />
        </Link>
      ))}
    </div>
  );
}
