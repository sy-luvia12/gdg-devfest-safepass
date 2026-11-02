import { useCallback, useEffect, useState } from 'react';
import { Copy, History, Send, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useEventId } from '@/app/AuthProvider';
import { formatPrice } from '@/app/format';
import { useMyTransfers } from '@/app/useMyTransfers';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { IncomingTransferBanner } from '@/components/IncomingTransferBanner';
import { StateView } from '@/components/StateView';
import { TicketCard } from '@/components/TicketCard';
import { cancelTransfer, getEvent, getMyTicket, refreshQrToken } from '@/lib/api';
import type { Event, Ticket } from '@/types';

const REFRESH_BEFORE_MS = 5_000;

export function TicketPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const { user } = useAuth();
  const transfers = useMyTransfers();
  const [cancelling, setCancelling] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    Promise.all([getEvent(eventId), getMyTicket(eventId)])
      .then(([e, t]) => {
        setEvent(e);
        setTicket(t);
      })
      .catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  // 만료 5초 전에 새 토큰을 받는다. 그 사이 검표·양도로 바뀌었을 수 있어 티켓도 다시 읽는다.
  const ticketId = ticket?.id;
  const issued = ticket?.status === 'issued';
  const expiresAt = ticket?.qrExpiresAt;
  useEffect(() => {
    if (!ticketId || !issued || expiresAt === undefined) return;
    let cancelled = false;
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BEFORE_MS);
    const timer = setTimeout(async () => {
      try {
        const latest = await getMyTicket(eventId);
        if (cancelled) return;
        if (!latest || latest.status !== 'issued') return setTicket(latest);
        const { token, expiresAt: next } = await refreshQrToken(latest.id);
        if (!cancelled) setTicket({ ...latest, qrToken: token, qrExpiresAt: next });
      } catch {
        if (!cancelled) setError(true);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId, ticketId, issued, expiresAt]);

  const header = (
    <AppHeader title="내 입장권" right={<IconButton icon={UserRound} label="내 정보" onClick={() => navigate('/me')} />} />
  );

  const pending = transfers.outgoing.find((t) => t.ticketId === ticket?.id);
  const onCancel = async () => {
    if (!pending) return;
    setCancelling(true);
    try {
      await cancelTransfer(pending.id);
    } finally {
      transfers.reload();
      setCancelling(false);
    }
  };

  if (error)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="입장권을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      </>
    );
  if (ticket === undefined || !event || !user)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );
  if (ticket === null)
    return (
      <>
        {header}
        <StateView
          kind="empty"
          title="아직 입장권이 없어요"
          description="학교 계정 1개당 1매를 받을 수 있어요"
          action={<Button onClick={() => navigate('/event')}>입장권 받으러 가기</Button>}
        />
        <div className="px-5">
          <IncomingTransferBanner transfers={transfers.incoming} />
        </div>
      </>
    );

  return (
    <>
      {header}
      <main className="flex flex-col gap-4 px-5 pb-36 pt-2 md:pb-10">
        {pending && (
          <section className="flex items-center gap-3 rounded-lg border border-line p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning">
              <Send size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-ink">{pending.toName ?? pending.toEmail}님에게 보내는 중</p>
              <p className="text-caption text-ink-2">
                {formatPrice(pending.price)} · 받는 분이 수락하면 입장권이 넘어가요
              </p>
            </div>
            <Button variant="ghost" size="sm" loading={cancelling} onClick={onCancel}>
              취소
            </Button>
          </section>
        )}
        <TicketCard eventName={event.name} ticket={ticket} owner={user} />
        <p className="flex items-center justify-center gap-1.5 text-caption text-ink-2">
          <ShieldCheck size={16} strokeWidth={1.75} />
          캡처한 화면으로는 입장할 수 없어요
        </p>
        <button
          type="button"
          onClick={() => navigate('/ticket/history')}
          className="flex items-center justify-center gap-1.5 text-label text-ink-2"
        >
          <History size={16} strokeWidth={1.75} />
          발급·양도 기록 보기
        </button>
        {import.meta.env.DEV && ticket.status === 'issued' && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(`safepass:${ticket.id}:${ticket.qrToken}`)}
            className="flex items-center justify-center gap-1 text-caption text-ink-3"
          >
            <Copy size={14} strokeWidth={1.75} />
            개발용: QR 내용 복사
          </button>
        )}
      </main>
      {ticket.status === 'issued' && !pending && (
        <BottomBar>
          <Button variant="secondary" onClick={() => navigate('/ticket/transfer')}>
            양도하기
          </Button>
        </BottomBar>
      )}
    </>
  );
}
