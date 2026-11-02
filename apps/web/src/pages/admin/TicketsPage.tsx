import { useCallback, useEffect, useState } from 'react';
import { Ticket as TicketIcon, Users, UserCheck, Package } from 'lucide-react';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { formatDateTime, formatTime, maskStudentId } from '@/app/format';
import { Button } from '@/components/Button';
import { FilterChips } from '@/components/FilterChips';
import { ListItem } from '@/components/ListItem';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { SearchField } from '@/components/SearchField';
import { StatCard } from '@/components/StatCard';
import { StateView } from '@/components/StateView';
import { StatusBadge } from '@/components/StatusBadge';
import { listTickets } from '@/lib/api';
import type { TicketRow } from '@/types';

type Filter = 'all' | 'issued' | 'used';

/** 발급된 입장권 목록과 남은 수량 */
export function TicketsPage() {
  const eventId = useEventId();
  const { event } = useAdmin();
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(false);
    listTickets(eventId).then(setRows).catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const q = query.trim();
  const shown = (rows ?? []).filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (!q || r.ownerName.includes(q) || r.ownerStudentId.includes(q) || r.nftTokenId.includes(q)),
  );

  return (
    <>
      <PageTitle title="발급 현황" description="누가 입장권을 받았고, 몇 장이 남았는지 확인해요" />
      {event && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="정원" value={`${event.capacity.toLocaleString('ko-KR')}명`} />
          <StatCard icon={TicketIcon} label="발급" value={`${event.issuedCount.toLocaleString('ko-KR')}매`} />
          <StatCard icon={UserCheck} label="입장" value={`${event.enteredCount.toLocaleString('ko-KR')}명`} />
          <StatCard
            icon={Package}
            label="남은 수량"
            value={`${Math.max(0, event.capacity - event.issuedCount).toLocaleString('ko-KR')}매`}
          />
        </div>
      )}
      {error ? (
        <StateView
          kind="error"
          title="발급 목록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !rows ? (
        <StateView kind="loading" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterChips<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '전체', count: rows.length },
                { value: 'issued', label: '입장 전', count: rows.filter((r) => r.status === 'issued').length },
                { value: 'used', label: '입장함', count: rows.filter((r) => r.status === 'used').length },
              ]}
            />
            <SearchField value={query} onChange={setQuery} placeholder="이름, 학번, NFT 번호" />
          </div>
          <ResponsiveTable
            rows={shown}
            rowKey={(r) => r.id}
            empty="조건에 맞는 입장권이 없어요"
            columns={[
              { header: 'NFT', cell: (r) => <span className="tabular">{r.nftTokenId}</span> },
              { header: '이름', cell: (r) => r.ownerName },
              { header: '학번', cell: (r) => <span className="text-ink-2 tabular">{maskStudentId(r.ownerStudentId)}</span> },
              { header: '발급', cell: (r) => <span className="text-caption text-ink-2 tabular">{formatDateTime(r.issuedAt)}</span> },
              { header: '상태', cell: (r) => <StatusBadge kind={r.status === 'used' ? 'used' : 'available'} /> },
              {
                header: '입장 시각',
                className: 'text-right',
                cell: (r) => <span className="text-caption text-ink-3 tabular">{r.usedAt ? formatTime(r.usedAt) : '-'}</span>,
              },
            ]}
            mobile={(r) => (
              <ListItem
                title={`${r.ownerName} · ${r.nftTokenId}`}
                subtitle={`${maskStudentId(r.ownerStudentId)} · ${formatDateTime(r.issuedAt)} 발급`}
                trailing={<StatusBadge kind={r.status === 'used' ? 'used' : 'available'} />}
              />
            )}
          />
        </div>
      )}
    </>
  );
}
