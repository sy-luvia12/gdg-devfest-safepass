import { CalendarPlus, ChevronRight, MapPin, School as SchoolIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { eventTitle, formatEventDate } from '@/app/format';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { cx } from '@/components/cx';
import { PageTitle } from '@/components/PageTitle';
import { StateView } from '@/components/StateView';

/** 학교의 행사 목록. 고르면 그 행사의 관리 화면으로 간다 */
export function EventListPage() {
  const navigate = useNavigate();
  const { user, school, events, eventId, selectEvent } = useAuth();
  const teamAccount = !user?.adminSchoolId;

  const open = (id: string) => {
    selectEvent(id);
    navigate('/admin');
  };

  return (
    <>
      <PageTitle
        title="행사 목록"
        description={`${school?.name ?? ''} 행사예요. 행사마다 명단과 발급·입장을 따로 관리해요`}
        action={
          <div className="flex gap-2">
            {teamAccount && (
              <Button variant="secondary" size="sm" icon={<SchoolIcon size={16} strokeWidth={1.75} />} onClick={() => navigate('/admin/setup?new')}>
                새 학교 스페이스
              </Button>
            )}
            <Button size="sm" icon={<CalendarPlus size={16} strokeWidth={1.75} />} onClick={() => navigate('/admin/events/new')}>
              행사 등록
            </Button>
          </div>
        }
      />
      {events.length === 0 ? (
        <StateView kind="empty" title="아직 등록한 행사가 없어요" description="행사를 등록하면 여기에 보여요" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => open(e.id)} className="w-full text-left">
                <Card className={cx('flex flex-col gap-3 transition duration-200 hover:bg-surface', e.id === eventId && 'ring-2 ring-lavender')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-heading text-ink">{eventTitle(e)}</p>
                      <p className="mt-1 text-caption text-ink-2">{formatEventDate(e.date)}</p>
                    </div>
                    <ChevronRight size={18} strokeWidth={1.75} className="mt-1 shrink-0 text-ink-3" />
                  </div>
                  <p className="flex items-center gap-1 text-caption text-ink-2">
                    <MapPin size={14} strokeWidth={1.75} />
                    {e.place}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">
                      발급 <span className="tabular">{e.issuedCount.toLocaleString()} / {e.capacity.toLocaleString()}</span>
                    </Badge>
                    {e.settings.requireRoster ? (
                      <Badge tone={e.roster ? 'success' : 'warning'}>
                        {e.roster ? `명단 ${e.roster.count.toLocaleString()}명만` : '명단 필요'}
                      </Badge>
                    ) : (
                      <Badge tone="muted">재학생 누구나</Badge>
                    )}
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
