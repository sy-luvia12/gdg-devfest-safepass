import { useCallback, useEffect, useState } from 'react';
import { Copy, History, LayoutDashboard, LayoutList, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useEventId } from '@/app/AuthProvider';
import { eventTitle } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { StateView } from '@/components/StateView';
import { TicketCard } from '@/components/TicketCard';
import { cancelTicket, formatQrPayload, getEvent, getMyTicket, refreshQrToken, subscribeMyTicket } from '@/lib/api';
import { ApiError, type CancelResult, type Event, type Ticket } from '@/types';

const REFRESH_BEFORE_MS = 5_000;

const CANCEL_DONE: Record<Exclude<CancelResult, 'used'>, { title: string; description: string }> = {
  reassigned: { title: '입장권을 취소했어요', description: '입장권은 대기 명단의 다른 재학생에게 넘어갔어요' },
  released: { title: '입장권을 취소했어요', description: '대기자가 없어서 다시 받을 수 있는 표로 돌아갔어요' },
};

export function TicketPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const { user, events, refreshUser } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<Exclude<CancelResult, 'used'> | null>(null);

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

  // 재배정·입장·취소가 새로고침 없이 반영되도록 내 입장권을 구독한다.
  // 문서에는 QR이 없으므로, 같은 입장권이면 화면이 이미 받은 QR을 그대로 둔다.
  useEffect(() => {
    return subscribeMyTicket(eventId, (next) => {
      setTicket((prev) => {
        if (prev && next && prev.id === next.id && prev.status === 'issued' && next.status === 'issued') {
          return { ...next, qrToken: prev.qrToken, qrExpiresAt: prev.qrExpiresAt, qrSignature: prev.qrSignature };
        }
        return next;
      });
    });
  }, [eventId]);

  // 만료 5초 전에 새 토큰을 받는다. 그 사이 검표·취소로 바뀌었을 수 있어 티켓도 다시 읽는다.
  const ticketId = ticket?.id;
  const issued = ticket?.status === 'issued';
  const expiresAt = ticket?.qrExpiresAt;
  useEffect(() => {
    if (!ticketId || !issued || expiresAt === undefined || cancelled) return;
    let stop = false;
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BEFORE_MS);
    const timer = setTimeout(async () => {
      try {
        const latest = await getMyTicket(eventId);
        if (stop) return;
        if (!latest || latest.status !== 'issued') return setTicket(latest);
        const { token, expiresAt: next, signature } = await refreshQrToken(latest.id);
        if (!stop) setTicket({ ...latest, qrToken: token, qrExpiresAt: next, qrSignature: signature });
      } catch (e) {
        if (stop) return;
        // 다른 기기에 등록된 계정이면 내 정보를 다시 읽어 기기 확인 화면으로 보낸다
        if (e instanceof ApiError && e.code === 'device_blocked') void refreshUser();
        else setError(true);
      }
    }, delay);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [eventId, ticketId, issued, expiresAt, cancelled, refreshUser]);

  const onCancel = async () => {
    if (!ticket) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelTicket(ticket.id);
      if (result === 'used') {
        setCancelError('이미 사용된 입장권은 취소할 수 없어요');
      } else {
        setCancelled(result);
        setTicket(null);
      }
    } catch {
      setCancelError('취소하지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      setCancelling(false);
      setAskCancel(false);
    }
  };

  const header = (
    <AppHeader
      title="내 입장권"
      right={
        <>
          {events.length > 1 && <IconButton icon={LayoutList} label="축제 목록" onClick={() => navigate('/events')} />}
          {user?.role === 'admin' && (
            <IconButton icon={LayoutDashboard} label="관리자 화면" onClick={() => navigate('/admin')} />
          )}
          <IconButton icon={UserRound} label="내 정보" onClick={() => navigate('/me')} />
        </>
      }
    />
  );

  if (cancelled)
    return (
      <>
        {header}
        <StateView
          kind="empty"
          title={CANCEL_DONE[cancelled].title}
          description={CANCEL_DONE[cancelled].description}
          action={<Button variant="secondary" onClick={() => navigate('/event')}>축제 정보 보기</Button>}
        />
      </>
    );
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
      </>
    );

  return (
    <>
      {header}
      <main className="flex flex-col gap-4 px-5 pb-36 pt-2 md:pb-10">
        <TicketCard eventName={eventTitle(event)} ticket={ticket} owner={user} />
        <div className="flex flex-col items-center gap-1.5 text-caption text-ink-2">
          <p className="flex items-center gap-1.5">
            <Smartphone size={16} strokeWidth={1.75} />
            이 기기에 등록된 입장권이에요
          </p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck size={16} strokeWidth={1.75} />
            캡처한 화면으로는 입장할 수 없어요
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/ticket/history')}
          className="flex items-center justify-center gap-1.5 text-label text-ink-2"
        >
          <History size={16} strokeWidth={1.75} />
          발급·입장 기록 보기
        </button>
        {import.meta.env.DEV && ticket.status === 'issued' && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(formatQrPayload(ticket.id, ticket.qrToken, ticket.qrSignature))}
            className="flex items-center justify-center gap-1 text-caption text-ink-3"
          >
            <Copy size={14} strokeWidth={1.75} />
            개발용: QR 내용 복사
          </button>
        )}
      </main>
      {ticket.status === 'issued' && (
        <BottomBar>
          {cancelError && <p role="alert" className="text-center text-caption text-danger">{cancelError}</p>}
          {askCancel ? (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <p className="text-body text-ink">입장권을 취소할까요?</p>
              <p className="text-caption text-ink-2">
                취소하면 되돌릴 수 없어요.
                {event.allowReissueAfterCancel ? '' : ' 이 축제 입장권은 다시 받을 수 없어요.'} 입장권은 학생회가 정한
                방식으로 대기 명단의 다른 재학생에게 넘어가요
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={cancelling} onClick={() => setAskCancel(false)}>
                  그대로 두기
                </Button>
                <Button size="sm" loading={cancelling} onClick={onCancel}>
                  취소하기
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setAskCancel(true)}>
              못 가게 됐어요 · 입장권 취소
            </Button>
          )}
        </BottomBar>
      )}
    </>
  );
}
