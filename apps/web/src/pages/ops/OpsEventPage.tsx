import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { eventTitle, formatEventDate } from '@/app/format';
import { RosterEditor } from '@/components/ops/RosterEditor';
import { OpsBadge, OpsButton, OpsPanel, OpsState, OpsTitle } from '@/components/ops/ui';
import { getEvent, getSchool } from '@/lib/api';
import type { Event, School } from '@/types';

/** 행사 하나: 행사 명단(이름·학번) 편집. 줄마다 주최 학교 재학생 명단과 맞는지 보여준다 */
export function OpsEventPage() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setEvent(null);
    setError(false);
    getEvent(eventId)
      .then(async (e) => {
        setEvent(e);
        setSchool(await getSchool(e.schoolId).catch(() => null));
      })
      .catch(() => setError(true));
  }, [eventId]);

  if (error) {
    return (
      <OpsPanel>
        <OpsState kind="error" title="행사를 찾지 못했어요" action={<Link to="/ops"><OpsButton>개요로</OpsButton></Link>} />
      </OpsPanel>
    );
  }
  if (!event) {
    return (
      <OpsPanel>
        <OpsState kind="loading" />
      </OpsPanel>
    );
  }

  return (
    <>
      {school && (
        <Link
          to={`/ops/schools/${school.id}`}
          className="mb-3 inline-flex items-center gap-1 text-label text-ops-ink-3 hover:text-ops-ink"
        >
          <ChevronLeft size={15} strokeWidth={1.75} />
          {school.name}
        </Link>
      )}
      <OpsTitle
        title={`${eventTitle(event)} 행사 명단`}
        description="행사 담당자가 올리는 당첨자·참가자 명단이에요. 이름·학번만 저장하고, 메일은 재학생 명단에서 찾아요"
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <OpsBadge tone="muted">{formatEventDate(event.date)}</OpsBadge>
        <OpsBadge tone="muted">{event.place}</OpsBadge>
        <OpsBadge tone="muted">
          발급 {event.issuedCount}/{event.capacity} · 입장 {event.enteredCount}
        </OpsBadge>
        <OpsBadge tone="accent">{event.settings.requireRoster ? '행사 명단에 있는 학생만 발급' : '모든 재학생 대상'}</OpsBadge>
      </div>
      {event.settings.requireRoster ? (
        <RosterEditor kind="event" id={event.id} label={`${eventTitle(event)}_행사명단`} />
      ) : (
        <OpsPanel>
          <OpsState
            kind="empty"
            title={`모든 재학생 대상 행사라 행사 명단이 필요 없어요. ${school?.name ?? '학교'} 재학생 명단으로 가입한 학생은 누구나 받을 수 있어요`}
          />
        </OpsPanel>
      )}
    </>
  );
}
