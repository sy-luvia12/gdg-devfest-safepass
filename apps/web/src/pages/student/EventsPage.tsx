import { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronRight, MapPin, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { formatEventDate } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { Badge, type BadgeTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { StateView } from '@/components/StateView';
import { getMyTicket, myRosterStatus } from '@/lib/api';
import type { Event, RosterStatus, Ticket } from '@/types';

/** roster: 서버가 행사 명단과 대조한 결과 (명단 행사가 아니면 open) */
type Row = { event: Event; ticket: Ticket | null; roster: RosterStatus };
/** 묶음(고연전)은 제목 하나 아래 경기들을, 단독 행사는 제목 없이 하나씩 */
type Group = { title?: string; rows: Row[] };

function groupRows(rows: Row[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const title = row.event.seriesName;
    const last = groups[groups.length - 1];
    if (title && last?.title === title) last.rows.push(row);
    else groups.push({ title, rows: [row] });
  }
  return groups;
}

function status({ event, ticket, roster }: Row): { tone: BadgeTone; text: string } {
  if (ticket?.status === 'used') return { tone: 'muted', text: '입장함' };
  if (ticket) return { tone: 'success', text: '받음' };
  if (event.capacity - event.issuedCount <= 0) return { tone: 'muted', text: '마감' };
  // 명단 행사는 행사 담당자가 시트로 올린 명단의 학생만 받는다. 명단이 아직 없으면 아무도 못 받는다
  if (roster === 'no_roster') return { tone: 'muted', text: '명단 준비 중' };
  if (roster === 'not_on_roster') return { tone: 'muted', text: '명단에 없음' };
  return { tone: 'neutral', text: '받을 수 있어요' };
}

/** 우리 학교 학생이 받을 수 있는 축제·경기 목록. 행사마다 1인 1매 */
export function EventsPage() {
  const navigate = useNavigate();
  const { school, events, selectEvent } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    Promise.all([Promise.all(events.map((e) => getMyTicket(e.id))), myRosterStatus(events.map((e) => e.id))])
      .then(([tickets, roster]) =>
        events.map((event, i) => ({ event, ticket: tickets[i], roster: roster[event.id] ?? 'open' })),
      )
      .then(setRows)
      .catch(() => setError(true));
  }, [events]);
  useEffect(load, [load]);

  // 입장권이 있어도 행사 설명부터 보여 준다. 입장권은 상세 화면의 "내 입장권 보기"로 간다
  const open = ({ event }: Row) => {
    selectEvent(event.id);
    navigate('/event');
  };

  const header = (
    <AppHeader title="축제" right={<IconButton icon={UserRound} label="내 정보" onClick={() => navigate('/me')} />} />
  );

  if (error)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="축제 목록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      </>
    );
  if (!rows)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );
  if (rows.length === 0)
    return (
      <>
        {header}
        <StateView kind="empty" title="아직 열린 축제가 없어요" description="학생회가 행사를 열면 여기에 보여요" />
      </>
    );

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-10 pt-2">
        <p className="text-body text-ink-2">{school?.name} 재학생이 받을 수 있는 입장권이에요. 행사마다 1매씩 받을 수 있어요</p>
        {groupRows(rows).map((g, i) => (
          <section key={g.title ?? `single-${i}`} className="flex flex-col gap-3">
            {g.title && <h2 className="text-heading text-ink">{g.title}</h2>}
            {g.rows.map((row) => {
              const s = status(row);
              return (
                <button
                  key={row.event.id}
                  type="button"
                  onClick={() => open(row)}
                  className="flex items-center gap-3 rounded-lg border border-line bg-bg p-4 text-left transition duration-200 hover:bg-surface"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="truncate text-heading text-ink">{row.event.name}</p>
                    <p className="flex items-center gap-1.5 text-caption text-ink-2">
                      <Calendar size={14} strokeWidth={1.75} />
                      {formatEventDate(row.event.date)}
                    </p>
                    <p className="flex items-center gap-1.5 text-caption text-ink-2">
                      <MapPin size={14} strokeWidth={1.75} />
                      <span className="truncate">{row.event.place}</span>
                    </p>
                  </div>
                  <Badge tone={s.tone}>{s.text}</Badge>
                  <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-ink-3" />
                </button>
              );
            })}
          </section>
        ))}
      </main>
    </>
  );
}
