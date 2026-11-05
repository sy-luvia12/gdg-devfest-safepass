import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { eventTitle } from '@/app/format';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { PageTitle } from '@/components/PageTitle';
import { RosterPreview, SheetImportCard } from '@/components/SheetImportCard';
import { StateView } from '@/components/StateView';
import { getEvent, getEventRoster, importEventRoster } from '@/lib/api';
import type { RosterView } from '@/types';

/** 행사 명단 (당첨자·참가자). "명단에 있는 학생만 발급"이 켜진 행사는 여기 있는 학생만 입장권을 받는다 */
export function RosterPage() {
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
