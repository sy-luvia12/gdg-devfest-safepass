import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { eventTitle } from '@/app/format';
import { Badge } from '@/components/Badge';
import { DrawEntryTable, DrawRateNote, DrawStatCards, useEntryDraws } from '@/components/DrawAdmin';
import { Button } from '@/components/Button';
import { PageTitle } from '@/components/PageTitle';
import { RosterPreview, SheetImportCard } from '@/components/SheetImportCard';
import { StateView } from '@/components/StateView';
import { getEvent, getEventRoster, importEventRoster } from '@/lib/api';
import type { RosterView } from '@/types';

/** 행사 명단 메뉴. 즉석 추첨 행사는 명단 대신 추첨 결과를 보여 준다 */
export function RosterPage() {
  const { event } = useAdmin();
  if (event?.instantDraw) return <DrawResultsPage />;
  return <EventRosterPage />;
}

/** 즉석 추첨 결과: 누가 응모했고 체인이 무엇을 정했는지. 10초마다 갱신 */
function DrawResultsPage() {
  const eventId = useEventId();
  const { event } = useAdmin();
  const { data, error, reload } = useEntryDraws(eventId, true);
  return (
    <>
      <PageTitle
        title={event ? `추첨 결과 · ${eventTitle(event)}` : '추첨 결과'}
        description="학생이 행사 화면을 열면 응모되고, 블록체인이 블록 해시로 당첨을 정해요"
      />
      {error && !data ? (
        <StateView kind="error" title="추첨 결과를 불러오지 못했어요" action={<Button variant="secondary" onClick={reload}>다시 시도</Button>} />
      ) : !data ? (
        <StateView kind="loading" />
      ) : (
        <div className="flex flex-col gap-6">
          <DrawStatCards data={data} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DrawRateNote data={data} />
            <Link to="/admin/settings" className="flex items-center gap-1 text-label text-ink-2">
              재학생 수 바꾸기
              <ArrowRight size={14} strokeWidth={1.75} />
            </Link>
          </div>
          {data.counts.pending > 0 && (
            <p className="text-caption text-ink-3">결과를 기다리는 응모 {data.counts.pending}건 · 보통 20초 안에 정해져요</p>
          )}
          <DrawEntryTable data={data} />
        </div>
      )}
    </>
  );
}

/** 행사 명단 (당첨자·참가자). "명단에 있는 학생만 발급"이 켜진 행사는 여기 있는 학생만 입장권을 받는다 */
function EventRosterPage() {
  const eventId = useEventId();
  const { event, setEvent } = useAdmin();
  const [view, setView] = useState<RosterView | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    getEventRoster(eventId).then(setView).catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const onImported = () => {
    load();
    getEvent(eventId).then(setEvent).catch(() => {});
  };

  const requireRoster = event?.settings.requireRoster ?? false;

  return (
    <>
      <PageTitle
        title={event ? `행사 명단 · ${eventTitle(event)}` : '행사 명단'}
        description="이 행사의 당첨자·참가자 시트를 불러와요. 재학생 명단과 따로 관리해요"
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-4 py-3">
        <span className="flex items-center gap-2 text-label text-ink-2">
          명단에 있는 학생만 발급
          <Badge tone={requireRoster ? 'success' : 'muted'}>{requireRoster ? '켜짐' : '꺼짐 · 재학생 누구나'}</Badge>
        </span>
        <Link to="/admin/settings" className="flex items-center gap-1 text-label text-ink-2">
          행사 설정에서 바꾸기
          <ArrowRight size={14} strokeWidth={1.75} />
        </Link>
      </div>

      {error ? (
        <StateView
          kind="error"
          title="명단을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <SheetImportCard
            kind="event"
            view={view}
            onImport={(url) => importEventRoster(eventId, url)}
            onImported={onImported}
          />
          {view === null ? (
            <StateView kind="loading" />
          ) : view.summary ? (
            <RosterPreview view={view} />
          ) : (
            <StateView kind="empty" title="아직 불러온 명단이 없어요" description="시트 주소를 넣고 불러오면 여기에 보여요" />
          )}
        </div>
      )}
    </>
  );
}
