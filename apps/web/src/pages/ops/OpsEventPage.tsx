import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { eventTitle, formatEventDate } from '@/app/format';
import { RosterEditor } from '@/components/ops/RosterEditor';
import { OpsBadge, OpsButton, OpsPanel, OpsState, OpsTitle } from '@/components/ops/ui';
import { drawRateOf, formatRate, getEvent, getSchool, listEntryDraws } from '@/lib/api';
import type { EntryDrawAdmin, Event, School } from '@/types';

/** 행사 하나: 행사 명단(이름·학번) 편집. 줄마다 주최 학교 재학생 명단과 맞는지 보여준다 */
export function OpsEventPage() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [error, setError] = useState(false);
  const [draw, setDraw] = useState<EntryDrawAdmin | null>(null);

  useEffect(() => {
    setEvent(null);
    setError(false);
    getEvent(eventId)
      .then(async (e) => {
        setEvent(e);
        if (e.instantDraw) listEntryDraws(e.id).then(setDraw).catch(() => setDraw(null));
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
        title={`${eventTitle(event)} ${event.instantDraw ? '추첨' : '행사 명단'}`}
        description={
          event.instantDraw
            ? '학생이 행사 화면을 열면 응모되고, 블록체인이 당첨을 정해요. 당첨 확률은 행사 담당자가 행사 설정에서 정해요'
            : '행사 담당자가 올리는 당첨자·참가자 명단이에요. 이름·학번만 저장하고, 메일은 재학생 명단에서 찾아요'
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <OpsBadge tone="muted">{formatEventDate(event.date)}</OpsBadge>
        <OpsBadge tone="muted">{event.place}</OpsBadge>
        <OpsBadge tone="muted">
          발급 {event.issuedCount}/{event.capacity} · 입장 {event.enteredCount}
        </OpsBadge>
        <OpsBadge tone="accent">
          {event.instantDraw
            ? `추첨으로 발급 · 당첨 ${formatRate(drawRateOf(event.capacity, event.drawPool))}`
            : event.settings.requireRoster
              ? '행사 명단에 있는 학생만 발급'
              : '모든 재학생 대상'}
        </OpsBadge>
      </div>
      {event.instantDraw ? (
        <OpsPanel>
          <OpsState
            kind="empty"
            title={`추첨 행사라 행사 명단이 필요 없어요. 정원 ${event.capacity.toLocaleString('ko-KR')}명 ÷ 재학생 ${
              event.drawPool ? `${event.drawPool.toLocaleString('ko-KR')}명` : '수 미설정'
            } = 당첨 확률 ${formatRate(drawRateOf(event.capacity, event.drawPool))}. ${
              draw ? `지금까지 응모 ${draw.counts.total}명 · 당첨 ${draw.counts.won}명. ` : ''
            }학생 기록을 지우려면 학교 재학생 명단에서 그 학생을 지우세요`}
          />
        </OpsPanel>
      ) : event.settings.requireRoster ? (
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
