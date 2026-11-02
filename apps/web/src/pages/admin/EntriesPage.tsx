import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useEventId } from '@/app/AuthProvider';
import { downloadCsv } from '@/app/csv';
import { formatDateTime, formatTimeSec, maskStudentId } from '@/app/format';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FilterChips } from '@/components/FilterChips';
import { ListItem } from '@/components/ListItem';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { SearchField } from '@/components/SearchField';
import { StateView } from '@/components/StateView';
import { StatusBadge } from '@/components/StatusBadge';
import { listEntries, listStaff } from '@/lib/api';
import type { ScanLog, ScanResult } from '@/types';

type Filter = 'all' | ScanResult;

const RESULT_LABEL: Record<ScanResult, string> = {
  ok: '입장',
  expired: '만료',
  used: '중복',
  mismatch: '얼굴 불일치',
  invalid: '확인 불가',
};

/** 전체 입장 기록. 결과별로 거르고 이름·학번으로 찾는다 */
export function EntriesPage() {
  const eventId = useEventId();
  const [logs, setLogs] = useState<ScanLog[] | null>(null);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(false);
    Promise.all([listEntries(eventId), listStaff()])
      .then(([l, staff]) => {
        setLogs(l);
        setStaffNames(Object.fromEntries(staff.map((u) => [u.uid, u.name])));
      })
      .catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs?.length ?? 0 };
    logs?.forEach((l) => (c[l.result] = (c[l.result] ?? 0) + 1));
    return c;
  }, [logs]);

  const q = query.trim();
  const shown = (logs ?? []).filter(
    (l) =>
      (filter === 'all' || l.result === filter) &&
      (!q || (l.userName ?? '').includes(q) || (l.studentId ?? '').includes(q)),
  );

  const onExport = () =>
    downloadCsv(
      `입장기록_${eventId}.csv`,
      ['시각', '이름', '학번', '결과', '검표 스태프'],
      shown.map((l) => [
        formatDateTime(l.at),
        l.userName ?? '',
        maskStudentId(l.studentId),
        RESULT_LABEL[l.result],
        staffNames[l.staffUid ?? ''] ?? '',
      ]),
    );

  return (
    <>
      <PageTitle
        title="입장 기록"
        description="검표한 모든 기록이에요. 거부된 시도도 함께 남아요"
        action={
          <Button variant="secondary" size="sm" icon={<Download size={16} strokeWidth={1.75} />} disabled={!logs} onClick={onExport}>
            CSV 내보내기
          </Button>
        }
      />
      {error ? (
        <StateView
          kind="error"
          title="입장 기록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !logs ? (
        <StateView kind="loading" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterChips<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '전체', count: counts.all },
                ...(Object.keys(RESULT_LABEL) as ScanResult[]).map((r) => ({
                  value: r,
                  label: RESULT_LABEL[r],
                  count: counts[r] ?? 0,
                })),
              ]}
            />
            <SearchField value={query} onChange={setQuery} placeholder="이름 또는 학번 검색" />
          </div>
          <ResponsiveTable
            rows={shown}
            rowKey={(l) => l.id}
            empty="조건에 맞는 기록이 없어요"
            columns={[
              {
                header: '이름',
                cell: (l) => (
                  <span className="flex items-center gap-3">
                    <Avatar src={l.userPhotoUrl} alt={l.userName ?? '알 수 없음'} size={32} />
                    {l.userName ?? <span className="text-ink-3">알 수 없음</span>}
                  </span>
                ),
              },
              { header: '학번', cell: (l) => <span className="text-ink-2 tabular">{maskStudentId(l.studentId)}</span> },
              { header: '결과', cell: (l) => <StatusBadge kind={l.result} scan /> },
              { header: '검표 스태프', cell: (l) => <span className="text-ink-2">{staffNames[l.staffUid ?? ''] ?? '-'}</span> },
              {
                header: '시각',
                className: 'text-right',
                cell: (l) => <span className="text-caption text-ink-3 tabular">{formatTimeSec(l.at)}</span>,
              },
            ]}
            mobile={(l) => (
              <ListItem
                leading={<Avatar src={l.userPhotoUrl} alt={l.userName ?? '알 수 없음'} size={40} />}
                title={l.userName ?? '알 수 없음'}
                subtitle={`${maskStudentId(l.studentId)} · ${formatTimeSec(l.at)}`}
                trailing={<StatusBadge kind={l.result} scan />}
              />
            )}
          />
          <NextStepNote>CSV는 지금 바로 받을 수 있어요. 구글 시트로 바로 내보내기는 다음 단계예요.</NextStepNote>
        </div>
      )}
    </>
  );
}
