import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock, ShieldX } from 'lucide-react';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { formatDateTime, formatPrice } from '@/app/format';
import { Badge, type BadgeTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { FilterChips } from '@/components/FilterChips';
import { ListItem } from '@/components/ListItem';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StatCard } from '@/components/StatCard';
import { StateView } from '@/components/StateView';
import { listTransfers } from '@/lib/api';
import type { TransferView } from '@/types';

type Filter = 'all' | 'pending' | 'success' | 'blocked' | 'closed';

function status(t: TransferView): { tone: BadgeTone; text: string } {
  if (t.result === 'success') return { tone: 'success', text: '완료' };
  if (t.result === 'pending') return { tone: 'warning', text: '수락 대기' };
  if (t.result === 'cancelled') return { tone: 'muted', text: '보낸 쪽 취소' };
  if (t.result === 'declined') return { tone: 'muted', text: '받는 쪽 거절' };
  if (t.reason === 'over_face_value') return { tone: 'danger', text: '웃돈 차단' };
  if (t.reason === 'already_has_ticket') return { tone: 'danger', text: '이미 보유' };
  return { tone: 'danger', text: '재학생 아님' };
}

const isBlocked = (t: TransferView) => t.result === 'rejected';
const isClosed = (t: TransferView) => t.result === 'cancelled' || t.result === 'declined';

/** 양도 기록. 웃돈 시도를 몇 번 막았는지가 핵심 숫자 */
export function TransfersPage() {
  const eventId = useEventId();
  const { event } = useAdmin();
  const [rows, setRows] = useState<TransferView[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    setError(false);
    listTransfers(eventId).then(setRows).catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const list = rows ?? [];
  const count = (f: (t: TransferView) => boolean) => list.filter(f).length;
  const shown = list.filter((t) =>
    filter === 'all'
      ? true
      : filter === 'blocked'
        ? isBlocked(t)
        : filter === 'closed'
          ? isClosed(t)
          : t.result === filter,
  );
  const faceValue = event?.faceValue ?? 0;

  return (
    <>
      <PageTitle title="양도 기록" description={`정가(${formatPrice(faceValue)}) 이하 양도만 허용돼요. 웃돈이 붙은 요청은 자동으로 막아요`} />
      {error ? (
        <StateView
          kind="error"
          title="양도 기록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !rows ? (
        <StateView kind="loading" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={ShieldX} label="웃돈 거래 차단" value={`${count((t) => t.reason === 'over_face_value')}건`} />
            <StatCard icon={CheckCircle2} label="양도 완료" value={`${count((t) => t.result === 'success')}건`} />
            <StatCard icon={Clock} label="수락 대기" value={`${count((t) => t.result === 'pending')}건`} />
            <StatCard icon={Ban} label="취소·거절" value={`${count(isClosed)}건`} />
          </div>
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '전체', count: list.length },
              { value: 'pending', label: '수락 대기', count: count((t) => t.result === 'pending') },
              { value: 'success', label: '완료', count: count((t) => t.result === 'success') },
              { value: 'blocked', label: '규칙 위반 차단', count: count(isBlocked) },
              { value: 'closed', label: '취소·거절', count: count(isClosed) },
            ]}
          />
          <ResponsiveTable
            rows={shown}
            rowKey={(t) => t.id}
            empty="아직 양도 기록이 없어요"
            columns={[
              { header: 'NFT', cell: (t) => <span className="tabular">{t.nftTokenId}</span> },
              { header: '보낸 사람', cell: (t) => t.fromName },
              { header: '받는 사람', cell: (t) => <span className="text-ink-2">{t.toName ?? t.toEmail}</span> },
              {
                header: '가격',
                cell: (t) => (
                  <span className={t.price > faceValue ? 'text-danger tabular' : 'tabular'}>{formatPrice(t.price)}</span>
                ),
              },
              { header: '결과', cell: (t) => <Badge tone={status(t).tone}>{status(t).text}</Badge> },
              {
                header: '시각',
                className: 'text-right',
                cell: (t) => <span className="text-caption text-ink-3 tabular">{formatDateTime(t.createdAt)}</span>,
              },
            ]}
            mobile={(t) => (
              <ListItem
                title={`${t.fromName} → ${t.toName ?? t.toEmail}`}
                subtitle={`${t.nftTokenId} · ${formatPrice(t.price)} · ${formatDateTime(t.createdAt)}`}
                trailing={<Badge tone={status(t).tone}>{status(t).text}</Badge>}
              />
            )}
          />
        </div>
      )}
    </>
  );
}
