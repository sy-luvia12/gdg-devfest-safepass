import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, Dices, Percent, Users } from 'lucide-react';
import { formatDateTime, maskStudentId } from '@/app/format';
import { Badge } from '@/components/Badge';
import { ListItem } from '@/components/ListItem';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StatCard } from '@/components/StatCard';
import { formatRate, listEntryDraws } from '@/lib/api';
import type { EntryDrawAdmin } from '@/types';

// 결과는 체인이 정하고, 학생 화면이 열릴 때마다 응모가 생긴다. 관리자 화면은 이 간격으로 다시 읽는다
const POLL_MS = 10_000;

/** 관리자 추첨 현황을 읽고 주기적으로 갱신한다. enabled가 false면(추첨 행사가 아니면) 읽지 않는다 */
export function useEntryDraws(eventId: string, enabled: boolean) {
  const [data, setData] = useState<EntryDrawAdmin | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    if (!enabled) return;
    listEntryDraws(eventId)
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [eventId, enabled]);
  useEffect(() => {
    load();
    if (!enabled) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, enabled]);
  return { data, error, reload: load };
}

const n = (v: number) => v.toLocaleString('ko-KR');

/** 응모·당첨·당첨 확률 카드 3개 */
export function DrawStatCards({ data }: { data: EntryDrawAdmin }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
      <StatCard icon={Users} label="추첨 응모" value={`${n(data.counts.total)}명`} />
      <StatCard icon={CircleCheck} label="당첨" value={`${n(data.counts.won)}명`} />
      <StatCard icon={Percent} label="당첨 확률" value={formatRate(data.winBps)} />
    </div>
  );
}

/** 당첨 확률이 어떻게 정해졌는지 한 줄로 */
export function DrawRateNote({ data }: { data: EntryDrawAdmin }) {
  return (
    <p className="flex items-center gap-2 text-caption text-ink-2">
      <Dices size={16} strokeWidth={1.75} className="shrink-0" />
      정원 {n(data.capacity)}명 ÷ 재학생 {data.drawPool ? `${n(data.drawPool)}명` : '수 미설정'} = 당첨 확률 {formatRate(data.winBps)}. 결과는
      블록체인이 정해서 학생회도 바꿀 수 없어요
    </p>
  );
}

const STATUS: Record<EntryDrawAdmin['entries'][number]['status'], { tone: 'success' | 'muted' | 'neutral'; text: string }> = {
  won: { tone: 'success', text: '당첨' },
  lost: { tone: 'muted', text: '낙첨' },
  pending: { tone: 'neutral', text: '추첨 중' },
};

/** 응모자 목록: 이름, 학번(가림), 결과, 점수, 응모 시각 */
export function DrawEntryTable({ data, limit }: { data: EntryDrawAdmin; limit?: number }) {
  const rows = limit ? data.entries.slice(0, limit) : data.entries;
  return (
    <ResponsiveTable
      rows={rows}
      rowKey={(r) => `${r.studentId}-${r.createdAt}`}
      empty="아직 응모한 학생이 없어요. 학생이 행사 화면을 열면 응모돼요"
      columns={[
        { header: '이름', cell: (r) => r.name },
        { header: '학번', cell: (r) => <span className="text-ink-2 tabular">{maskStudentId(r.studentId)}</span> },
        { header: '결과', cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge> },
        {
          header: '점수 / 기준',
          cell: (r) => <span className="font-mono text-label text-ink-2">{r.score !== null ? `${r.score} / ${data.winBps}` : '-'}</span>,
        },
        {
          header: '응모 시각',
          className: 'text-right',
          cell: (r) => <span className="text-caption text-ink-3 tabular">{formatDateTime(r.createdAt)}</span>,
        },
      ]}
      mobile={(r) => (
        <ListItem
          title={r.name}
          subtitle={`${maskStudentId(r.studentId)} · ${formatDateTime(r.createdAt)}${r.score !== null ? ` · 점수 ${r.score}` : ''}`}
          trailing={<Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>}
        />
      )}
    />
  );
}
