import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutList, ListOrdered, ShieldCheck, Smartphone, UserCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import calendarIcon from '@/assets/icons/festival-calendar.svg';
import locationIcon from '@/assets/icons/festival-location.svg';
import { useAuth, useEventId } from '@/app/AuthProvider';
import { eventTitle, formatEventDate } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { StateView } from '@/components/StateView';
import { getEvent, getMyTicket, issueTicket } from '@/lib/api';
import { ApiError, type Event, type Ticket } from '@/types';

type Data = { event: Event; ticket: Ticket | null };

export function EventPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const { school, events, user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [cancelledBefore, setCancelledBefore] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([getEvent(eventId), getMyTicket(eventId)])
      .then(([event, ticket]) => setData({ event, ticket }))
      .catch(() => setLoadError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const onIssue = async () => {
    setIssuing(true);
    setIssueError(null);
    try {
      await issueTicket(eventId);
      navigate('/ticket');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      if (code === 'cancelled_before') setCancelledBefore(true);
      setIssueError(
        code === 'cancelled_before'
          ? '이 축제 입장권을 취소한 적이 있어서 다시 받을 수 없어요'
          : code === 'wrong_role'
          ? '학생 계정으로만 받을 수 있어요'
          : code === 'sold_out'
          ? '모두 발급되었어요'
          : code === 'not_school_account'
            ? '학교 계정으로만 받을 수 있어요'
            : code === 'not_in_roster'
              ? '학생회 명단에 없어서 받을 수 없어요. 학생회에 문의해 주세요'
              : '입장권을 받지 못했어요. 다시 시도해 주세요',
      );
      setIssuing(false);
    }
  };

  const header = (
    <AppHeader
      title="축제 정보"
      right={
        <>
          {events.length > 1 && <IconButton icon={LayoutList} label="축제 목록" onClick={() => navigate('/events')} />}
          <IconButton icon={UserRound} label="내 정보" onClick={() => navigate('/me')} />
        </>
      }
    />
  );

  if (loadError)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="축제 정보를 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      </>
    );
  if (!data)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );

  const { event, ticket } = data;
  const remaining = Math.max(0, event.capacity - event.issuedCount);
  const soldOut = remaining === 0 && !ticket;

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-36 pt-2 md:pb-10">
        <section className="flex aspect-[4/3] flex-col justify-end gap-2 rounded-xl bg-grad-ticket p-6 shadow-float">
          <div className="w-full [container-type:inline-size]">
            <p className="inline-flex max-w-full rounded-full border border-white/[0.22] bg-white/[0.28] px-3 py-1.5 text-[12px] font-medium leading-[1.4] text-ink-2 [overflow-wrap:anywhere] [@container(max-width:240px)]:px-2.5 [@container(max-width:240px)]:py-1 [@container(max-width:240px)]:text-[11px]">
              {school?.name} 재학생 전용
            </p>
            <h2 className="mt-4 text-[clamp(22px,7cqw,30px)] font-bold leading-[1.22] tracking-[-0.03em] text-ink [overflow-wrap:anywhere] [@container(240px<width<=280px)]:mt-2 [@container(max-width:240px)]:mt-2 [@container(max-width:240px)]:text-[20px]">
              {eventTitle(event)}
            </h2>
            <div className="mt-5 flex flex-col gap-2 text-[14px] font-medium leading-[1.4] text-ink-2 [@container(240px<width<=280px)]:mt-3 [@container(240px<width<=280px)]:gap-1.5 [@container(max-width:240px)]:mt-2 [@container(max-width:240px)]:gap-1 [@container(max-width:240px)]:text-[12px]">
              <span className="flex items-center gap-3">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/25 [@container(240px<width<=280px)]:h-7 [@container(240px<width<=280px)]:w-7 [@container(max-width:240px)]:h-6 [@container(max-width:240px)]:w-6">
                  <img src={calendarIcon} alt="" className="h-6 w-6 shrink-0 [@container(max-width:240px)]:h-5 [@container(max-width:240px)]:w-5" />
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{formatEventDate(event.date)}</span>
              </span>
              <span className="flex items-center gap-3">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/25 [@container(240px<width<=280px)]:h-7 [@container(240px<width<=280px)]:w-7 [@container(max-width:240px)]:h-6 [@container(max-width:240px)]:w-6">
                  <img src={locationIcon} alt="" className="h-6 w-6 shrink-0 [@container(max-width:240px)]:h-5 [@container(max-width:240px)]:w-5" />
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{event.place}</span>
              </span>
            </div>
          </div>
        </section>

        <Card padded={false} className="grid grid-cols-2 divide-x divide-line">
          <Info label="정원" value={`${event.capacity.toLocaleString('ko-KR')}명`} />
          <Info label="남은 수량" value={`${remaining.toLocaleString('ko-KR')}매`} />
        </Card>

        <ul className="flex flex-col gap-3">
          <Guide icon={UserCheck} text="학교 계정 1개당 1매만 받을 수 있어요" />
          <Guide icon={Smartphone} text="입장권은 받은 기기에 묶여요. 다른 기기나 계정으로는 쓸 수 없어요" />
          <Guide icon={ShieldCheck} text="입장권 번호는 블록체인에 기록돼서 위조할 수 없어요" />
          <Guide icon={ListOrdered} text="못 가게 되면 취소해 주세요. 표는 학생회가 정한 방식으로 대기 명단의 재학생에게 넘어가요" />
        </ul>
      </main>

      <BottomBar>
        {issueError && <p role="alert" className="text-center text-caption text-danger">{issueError}</p>}
        {ticket ? (
          <Button onClick={() => navigate('/ticket')}>내 입장권 보기</Button>
        ) : cancelledBefore ? (
          <Button disabled>취소한 입장권은 다시 받을 수 없어요</Button>
        ) : user && user.role !== 'student' ? (
          <Button disabled>학생 계정으로만 받을 수 있어요</Button>
        ) : soldOut ? (
          <Button disabled>모두 발급되었어요</Button>
        ) : (
          <Button loading={issuing} onClick={onIssue}>
            입장권 받기
          </Button>
        )}
      </BottomBar>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <span className="text-caption text-ink-2">{label}</span>
      <span className="text-heading text-ink tabular">{value}</span>
    </div>
  );
}

function Guide({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-start gap-3 text-caption text-ink-2">
      <Icon size={16} strokeWidth={1.75} className="mt-px shrink-0" />
      {text}
    </li>
  );
}
