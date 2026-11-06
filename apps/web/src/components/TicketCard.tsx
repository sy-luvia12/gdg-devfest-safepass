import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatTime } from '@/app/format';
import { formatQrPayload } from '@/lib/api';
import type { Ticket, User } from '@/types';
import { Avatar } from './Avatar';
import { ChainRecord } from './ChainRecord';
import { cx } from './cx';
import { StatusBadge } from './StatusBadge';

const QR_TTL_MS = 30_000;

type Props = {
  eventName: string;
  ticket: Ticket;
  owner: Pick<User, 'name' | 'studentId' | 'photoUrl'>;
};

/** 핵심 비주얼: 그라데이션 카드 + QR + 카운트다운 + 본인 정보 (DESIGN.md 5장) */
export function TicketCard({ eventName, ticket, owner }: Props) {
  const used = ticket.status === 'used';
  const now = useNow(used ? null : 250);
  const leftMs = Math.max(0, ticket.qrExpiresAt - now);
  const leftSec = Math.ceil(leftMs / 1000);
  const payload = formatQrPayload(ticket.id, ticket.qrToken, ticket.qrSignature);

  return (
    <article className="student-ticket-card flex flex-col gap-5 rounded-xl bg-grad-ticket p-5 shadow-float">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading text-ink">{eventName}</h2>
        <StatusBadge kind={used ? 'used' : leftSec <= 5 ? 'expiring' : 'available'} />
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className={cx('max-w-full rounded-lg bg-bg p-4 transition duration-200', used && 'opacity-30 grayscale')}>
          {used || ticket.qrToken ? (
            <div key={payload} className="animate-fade-in">
              <QRCodeSVG value={payload} size={208} className="block h-auto max-w-full" fgColor="#1F2328" bgColor="#FFFFFF" level="M" />
            </div>
          ) : (
            // 서버에서 QR을 받기 전 (기기 확인 중)
            <div className="aspect-square w-[208px] max-w-full animate-pulse rounded-md bg-surface" aria-label="QR을 받는 중" />
          )}
        </div>
        {used ? (
          <p className="text-caption text-ink-2">
            {ticket.usedAt ? `${formatTime(ticket.usedAt)}에 입장했어요` : '사용된 입장권이에요'}
          </p>
        ) : (
          <div className="flex w-[240px] max-w-full flex-col items-center gap-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-200 ease-linear"
                style={{ width: `${(leftMs / QR_TTL_MS) * 100}%` }}
              />
            </div>
            <p className="text-caption text-ink-2 tabular">
              {leftSec > 0 ? `${leftSec}초 후 새로고침` : '새로고침 중'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-white/70 p-3">
        <Avatar src={owner.photoUrl} alt={`${owner.name} 사진`} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-heading text-ink">{owner.name}</p>
          <p className="text-caption text-ink-2 tabular">{owner.studentId}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-caption text-ink-2 tabular">NFT {ticket.nftTokenId}</p>
          <ChainRecord chain={ticket.chain} compact />
        </div>
      </div>
    </article>
  );
}

function useNow(intervalMs: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
