import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatTimeSec, maskStudentId } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FilterChips } from '@/components/FilterChips';
import { ListItem } from '@/components/ListItem';
import { StateView } from '@/components/StateView';
import { StatusBadge } from '@/components/StatusBadge';
import { getMyScanHistory } from '@/lib/api';
import type { ScanLog } from '@/types';

type Filter = 'all' | 'ok' | 'rejected';

/** 스태프 본인이 처리한 검표 기록. 입장 분쟁이 생겼을 때 확인용 */
export function ScanHistoryPage() {
  const [logs, setLogs] = useState<ScanLog[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    setError(false);
    getMyScanHistory().then(setLogs).catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(
    () =>
      (logs ?? []).filter((l) => (filter === 'all' ? true : filter === 'ok' ? l.result === 'ok' : l.result !== 'ok')),
    [logs, filter],
  );
  const okCount = logs?.filter((l) => l.result === 'ok').length ?? 0;

  return (
    <>
      <AppHeader title="내 검표 기록" back="/staff/scan" />
      <main className="flex flex-col gap-4 px-6 pb-12 pt-8">
        {error ? (
          <StateView
            kind="error"
            title="기록을 불러오지 못했어요"
            action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
          />
        ) : !logs ? (
          <StateView kind="loading" />
        ) : (
          <>
            <FilterChips<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '전체', count: logs.length },
                { value: 'ok', label: '입장', count: okCount },
                { value: 'rejected', label: '거부', count: logs.length - okCount },
              ]}
            />
            {shown.length === 0 ? (
              <StateView kind="empty" title="해당하는 기록이 없어요" />
            ) : (
              <div>
                {shown.map((l) => (
                  <ListItem
                    key={l.id}
                    leading={<Avatar src={l.userPhotoUrl} alt={l.userName ?? '알 수 없음'} size={40} />}
                    title={l.userName ?? '알 수 없음'}
                    subtitle={`${maskStudentId(l.studentId)} · ${formatTimeSec(l.at)}`}
                    trailing={<StatusBadge kind={l.result} scan />}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
