import { useCallback, useEffect, useState } from 'react';
import { ListOrdered, RotateCcw, Shuffle, Users } from 'lucide-react';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { formatDateTime } from '@/app/format';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListItem } from '@/components/ListItem';
import { PageTitle } from '@/components/PageTitle';
import { SheetImportCard } from '@/components/SheetImportCard';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StatCard } from '@/components/StatCard';
import { StateView } from '@/components/StateView';
import { getWaitlist, importWaitlist, listReassignments } from '@/lib/api';
import type { Reassignment, WaitlistEntry, WaitlistView } from '@/types';

const MODE_LABEL = { queue: '대기 순서대로', random: '무작위' } as const;

// 운영진 회수는 재배정 방식과 상관없다
const modeLabel = (r: Reassignment) => (r.outcome === 'revoked' ? '-' : MODE_LABEL[r.mode]);

function outcome(r: Reassignment) {
  if (r.outcome === 'revoked') return { tone: 'danger' as const, text: '운영진 회수' };
  return r.outcome === 'reassigned'
    ? { tone: 'success' as const, text: '대기자에게 배정' }
    : { tone: 'muted' as const, text: '발급 가능으로 복귀' };
}

/** 취소·재배정 기록과 대기 명단. 취소표가 어떤 규칙으로 누구에게 갔는지 투명하게 보여준다 */
export function ReassignmentsPage() {
  const eventId = useEventId();
  const { event } = useAdmin();
  const [data, setData] = useState<{ records: Reassignment[]; waitlist: WaitlistEntry[]; view: WaitlistView } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    Promise.all([listReassignments(eventId), getWaitlist(eventId)])
      .then(([records, view]) => setData({ records, waitlist: view.entries, view }))
      .catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const mode = event?.reassignMode ?? 'queue';

  return (
    <>
      <PageTitle
        title="취소·재배정"
        description="학생끼리 넘기는 양도는 없어요. 취소한 입장권은 정해진 규칙으로만 대기 명단에 넘어가요"
      />
      {error ? (
        <StateView
          kind="error"
          title="기록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !data ? (
        <StateView kind="loading" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={mode === 'queue' ? ListOrdered : Shuffle} label="재배정 방식" value={MODE_LABEL[mode]} />
            <StatCard
              icon={ListOrdered}
              label="대기자에게 배정"
              value={`${data.records.filter((r) => r.outcome === 'reassigned').length}건`}
            />
            <StatCard
              icon={RotateCcw}
              label="발급 가능으로 복귀"
              value={`${data.records.filter((r) => r.outcome === 'released').length}건`}
            />
            <StatCard
              icon={Users}
              label="남은 대기자"
              value={`${data.waitlist.filter((w) => w.status === 'waiting').length}명`}
            />
          </div>

          <section className="flex flex-col gap-3">
            <h3 className="text-heading text-ink">취소 기록</h3>
            <ResponsiveTable
              rows={data.records}
              rowKey={(r) => r.id}
              empty="아직 취소된 입장권이 없어요"
              columns={[
                { header: 'NFT', cell: (r) => <span className="tabular">{r.nftTokenId}</span> },
                { header: '취소한 학생', cell: (r) => r.fromName },
                { header: '받은 학생', cell: (r) => <span className="text-ink-2">{r.toName ?? '-'}</span> },
                { header: '방식', cell: (r) => modeLabel(r) },
                { header: '결과', cell: (r) => <Badge tone={outcome(r).tone}>{outcome(r).text}</Badge> },
                {
                  header: '시각',
                  className: 'text-right',
                  cell: (r) => <span className="text-caption text-ink-3 tabular">{formatDateTime(r.createdAt)}</span>,
                },
              ]}
              mobile={(r) => (
                <ListItem
                  title={r.toName ? `${r.fromName} → ${r.toName}` : r.fromName}
                  subtitle={[r.nftTokenId, r.outcome === 'revoked' ? null : MODE_LABEL[r.mode], formatDateTime(r.createdAt)].filter(Boolean).join(' · ')}
                  trailing={<Badge tone={outcome(r).tone}>{outcome(r).text}</Badge>}
                />
              )}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-heading text-ink">대기 명단</h3>
            <p className="text-label text-ink-2">
              누가 취소하면 대기 명단의 학생이 받아가요. 시트는 위에서부터 대기 순서예요. 이미 배정된 학생은 다시 불러와도 그대로 남아요
            </p>
            <SheetImportCard
              kind="waitlist"
              view={{ summary: data.view.summary, entries: [], serviceAccountEmail: data.view.serviceAccountEmail }}
              onImport={(url) => importWaitlist(eventId, url)}
              onImported={load}
            />
            <ResponsiveTable
              rows={data.waitlist}
              rowKey={(w) => w.studentId || String(w.order)}
              empty="대기 명단이 비어 있어요"
              columns={[
                { header: '순서', cell: (w) => <span className="tabular">{w.order}</span> },
                { header: '이름', cell: (w) => w.name },
                { header: '학번', cell: (w) => <span className="text-ink-2 tabular">{w.studentId}</span> },
                {
                  header: '상태',
                  className: 'text-right',
                  cell: (w) => <WaiterBadge status={w.status} />,
                },
              ]}
              mobile={(w) => (
                <ListItem
                  title={`${w.order}. ${w.name}`}
                  subtitle={w.studentId}
                  trailing={<WaiterBadge status={w.status} />}
                />
              )}
            />
          </section>
        </div>
      )}
    </>
  );
}

function WaiterBadge({ status }: { status: string }) {
  if (status === 'waiting') return <Badge tone="muted">대기 중</Badge>;
  if (status === 'assigned') return <Badge tone="success">배정됨</Badge>;
  return <Badge tone="muted">처리됨</Badge>;
}
