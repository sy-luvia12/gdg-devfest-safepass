import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Blocks, ChevronRight, Dices, LayoutList, ListOrdered, ShieldCheck, Smartphone, UserCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import calendarIcon from '@/assets/icons/festival-calendar.svg';
import locationIcon from '@/assets/icons/festival-location.svg';
import { useAuth, useEventId } from '@/app/AuthProvider';
import { eventTitle, formatEventDate } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EntryDrawCard } from '@/components/EntryDrawCard';
import { IconButton } from '@/components/IconButton';
import { StateView } from '@/components/StateView';
import { enterDraw, getEvent, getMyEntryDraw, getMyTicket, issueTicket, myRosterStatus } from '@/lib/api';
import { ApiError, type EntryDraw, type Event, type RosterStatus, type Ticket } from '@/types';

// 추첨 결과를 기다리는 동안 다시 묻는 간격
const DRAW_POLL_MS = 3_000;

type Data = { event: Event; ticket: Ticket | null; roster: RosterStatus };

export function EventPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const { school, events, user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [cancelledBefore, setCancelledBefore] = useState(false);
  // 즉석 추첨 행사: 화면을 열면 응모하고, 체인 결과가 나올 때까지 다시 묻는다
  const [entry, setEntry] = useState<EntryDraw | null>(null);
  const [entering, setEntering] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const entered = useRef<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    // 명단 행사: 서버가 행사 명단과 대조한 결과로 받기 버튼을 막는다 (발급할 때 서버가 다시 확인한다)
    Promise.all([getEvent(eventId), getMyTicket(eventId), user?.role === 'student' ? myRosterStatus([eventId]) : {}])
      .then(([event, ticket, roster]) => setData({ event, ticket, roster: (roster as Record<string, RosterStatus>)[eventId] ?? 'open' }))
      .catch(() => setLoadError(true));
  }, [eventId, user?.role]);
  useEffect(load, [load]);

  const drawEvent = !!data?.event.instantDraw && user?.role === 'student' && !data.ticket && data.roster !== 'cancelled';
  useEffect(() => {
    if (!drawEvent || entered.current === eventId) return;
    entered.current = eventId;
    setEntering(true);
    setDrawError(null);
    // 이미 응모했으면 그 응모를 그대로 돌려받는다 (다시 뽑지 않는다)
    enterDraw(eventId)
      .then(setEntry)
      .catch((e) => {
        const code = e instanceof ApiError ? e.code : 'unknown';
        setDrawError(
          code === 'not_registered'
            ? '회원가입(사진·학생증)을 마친 뒤에 응모할 수 있어요'
            : code === 'not_school_account'
              ? '이 학교 학생만 응모할 수 있어요'
              : '잠시 후 다시 열어 주세요',
        );
      })
      .finally(() => setEntering(false));
  }, [drawEvent, eventId]);

  useEffect(() => {
    if (entry?.status !== 'pending') return;
    const timer = setInterval(() => {
      getMyEntryDraw(eventId)
        .then((next) => next && setEntry(next))
        .catch(() => undefined);
    }, DRAW_POLL_MS);
    return () => clearInterval(timer);
  }, [entry?.status, eventId]);

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
              : code === 'draw_not_won'
                ? '추첨에 당첨된 학생만 받을 수 있어요'
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
          {events.length > 0 && <IconButton icon={LayoutList} label="축제 목록" onClick={() => navigate('/events')} />}
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
      <main className="flex flex-col gap-6 px-5 pb-6 pt-2">
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
          {event.instantDraw && (
            <Guide icon={Dices} text="추첨 행사예요. 이 화면을 열면 응모되고, 블록체인이 정한 당첨자만 입장권을 받아요" />
          )}
          <Guide icon={ListOrdered} text="못 가게 되면 취소해 주세요. 표는 학생회가 정한 방식으로 대기 명단의 재학생에게 넘어가요" />
        </ul>

        {drawEvent && <EntryDrawCard entry={entry} entering={entering} error={drawError} />}

        <nav className="flex flex-col">
          <LinkRow icon={Blocks} label="공개 현황판" hint="발행량·재배정·운영진 기록" onClick={() => navigate('/event/board')} />
          {event.lottery && (
            <LinkRow icon={ShieldCheck} label="추첨 검증" hint="추첨 결과를 내 폰에서 다시 계산" onClick={() => navigate('/event/draw')} />
          )}
        </nav>
      </main>

      <BottomBar>
        {issueError && <p role="alert" className="text-center text-caption text-danger">{issueError}</p>}
        {ticket ? (
          <Button onClick={() => navigate('/ticket')}>내 입장권 보기</Button>
        ) : cancelledBefore || data.roster === 'cancelled' ? (
          <Button disabled>취소한 입장권은 다시 받을 수 없어요</Button>
        ) : user && user.role !== 'student' ? (
          <Button disabled>학생 계정으로만 받을 수 있어요</Button>
        ) : soldOut ? (
          <Button disabled>모두 발급되었어요</Button>
        ) : event.instantDraw ? (
          entry?.status === 'won' ? (
            <Button loading={issuing} onClick={onIssue}>
              입장권 받기
            </Button>
          ) : entry?.status === 'lost' ? (
            <Button disabled>추첨에 당첨되지 않았어요</Button>
          ) : (
            <Button disabled>추첨 결과를 기다리는 중이에요</Button>
          )
        ) : data.roster === 'not_on_roster' ? (
          <Button disabled>행사 명단에 없어서 받을 수 없어요</Button>
        ) : data.roster === 'no_roster' ? (
          <Button disabled>행사 명단이 아직 올라오지 않았어요</Button>
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

function LinkRow({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 border-b border-line py-3.5 text-left last:border-0"
    >
      <Icon size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-ink">{label}</span>
        <span className="text-caption text-ink-2">{hint}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-ink-3" />
    </button>
  );
}
