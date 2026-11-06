import { useEffect, useState } from 'react';
import { ChevronRight } from '@/components/icons';
import { Link, useParams } from 'react-router-dom';
import { eventTitle } from '@/app/format';
import { RosterEditor } from '@/components/ops/RosterEditor';
import { OpsBadge, OpsButton, OpsPanel, OpsState, OpsTitle } from '@/components/ops/ui';
import { drawRateOf, formatRate, getSchool, listEvents } from '@/lib/api';
import type { Event, School } from '@/types';

/** 학교 하나: 재학생 명단(회원가입 대조용) 편집과 그 학교 행사들 */
export function OpsSchoolPage() {
  const { schoolId = '' } = useParams();
  const [school, setSchool] = useState<School | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    setSchool(null);
    setError(false);
    Promise.all([getSchool(schoolId), listEvents(schoolId)])
      .then(([s, e]) => {
        setSchool(s);
        setEvents(e);
      })
      .catch(() => setError(true));
  }, [schoolId]);

  if (error) {
    return (
      <OpsPanel>
        <OpsState kind="error" title="학교를 찾지 못했어요" action={<Link to="/ops"><OpsButton>개요로</OpsButton></Link>} />
      </OpsPanel>
    );
  }
  if (!school) {
    return (
      <OpsPanel>
        <OpsState kind="loading" />
      </OpsPanel>
    );
  }

  return (
    <>
      <OpsTitle
        title={`${school.name} 재학생 명단`}
        description={`회원가입할 때 대조하는 학교 전체 명단이에요. 메일은 @${school.domain}만 받아요`}
      />
      {events.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {events.map((e) => (
            <Link
              key={e.id}
              to={`/ops/events/${e.id}`}
              className="flex h-9 items-center gap-2 rounded-full border border-ops-line px-3.5 text-label text-ops-ink-2 hover:border-ops-accent hover:text-ops-ink"
            >
              {eventTitle(e)} {e.instantDraw ? '추첨' : '행사 명단'}
              <OpsBadge tone="muted">{e.instantDraw ? formatRate(drawRateOf(e.capacity, e.drawPool)) : (e.roster?.count ?? 0)}</OpsBadge>
              <ChevronRight size={14} strokeWidth={1.75} />
            </Link>
          ))}
        </div>
      )}
      <RosterEditor kind="school" id={school.id} label={`${school.name}_재학생명단`} />
    </>
  );
}
