import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { eventTitle, formatEventDate } from '@/app/format';
import { OpsBadge, OpsButton, OpsPanel, OpsState, OpsTitle } from '@/components/ops/ui';
import { getSchool, listEvents, listSchools } from '@/lib/api';
import type { Event, School } from '@/types';

type Row = { school: School; events: Event[] };

/** 개요: 학교마다 재학생 명단 수와 행사(행사 명단 수)를 한눈에 */
export function OpsHomePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    listSchools()
      .then((schools) =>
        Promise.all(
          schools.map(async (s) => ({ school: await getSchool(s.id), events: await listEvents(s.id) })),
        ),
      )
      .then(setRows)
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <OpsTitle title="개요" description="학교 명단과 행사 명단을 바로 고칠 수 있어요. 고친 내용은 서버에 바로 저장돼요" />
      {error ? (
        <OpsPanel>
          <OpsState kind="error" action={<OpsButton onClick={load}>다시 시도</OpsButton>} />
        </OpsPanel>
      ) : !rows ? (
        <OpsPanel>
          <OpsState kind="loading" />
        </OpsPanel>
      ) : rows.length === 0 ? (
        <OpsPanel>
          <OpsState kind="empty" title="학교가 없어요. 시드를 먼저 넣어 주세요" />
        </OpsPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ school, events }) => (
            <OpsPanel key={school.id} className="flex flex-col">
              <Link
                to={`/ops/schools/${school.id}`}
                className="flex items-center justify-between gap-3 border-b border-ops-line px-5 py-4 hover:bg-ops-raised/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: school.brandColor }} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-heading text-ops-ink">{school.name}</p>
                    <p className="text-caption text-ops-ink-3">@{school.domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <OpsBadge tone={school.studentRoster?.count ? 'accent' : 'warn'}>재학생 {school.studentRoster?.count ?? 0}명</OpsBadge>
                  <ChevronRight size={16} strokeWidth={1.75} className="text-ops-ink-3" />
                </div>
              </Link>
              {events.length === 0 ? (
                <p className="px-5 py-4 text-caption text-ops-ink-3">행사가 없어요</p>
              ) : (
                events.map((e) => (
                  <Link
                    key={e.id}
                    to={`/ops/events/${e.id}`}
                    className="flex items-center justify-between gap-3 border-b border-ops-line px-5 py-3 last:border-0 hover:bg-ops-raised/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-label text-ops-ink">{eventTitle(e)}</p>
                      <p className="text-caption text-ops-ink-3">
                        {formatEventDate(e.date)} · 발급 {e.issuedCount}/{e.capacity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.settings.requireRoster ? (
                        <OpsBadge tone={e.roster?.sheetUrl ? 'accent' : 'warn'}>
                          행사 명단 {e.roster?.sheetUrl ? `${e.roster.count}명` : '시트 전'}
                        </OpsBadge>
                      ) : (
                        <OpsBadge tone="muted">모든 재학생</OpsBadge>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </OpsPanel>
          ))}
        </div>
      )}
    </>
  );
}
