import { useEffect, useState } from 'react';
import { ArrowRight, Clock, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { formatTime } from '@/app/format';
import { Button } from '@/components/Button';
import { CapacityCard } from '@/components/CapacityCard';
import { DrawRateNote, DrawStatCards, useEntryDraws } from '@/components/DrawAdmin';
import { EntryLogTable } from '@/components/EntryLogTable';
import { PageTitle } from '@/components/PageTitle';
import { StatCard } from '@/components/StatCard';
import { StateView } from '@/components/StateView';
import { subscribeEventStats } from '@/lib/api';
import type { EventStats } from '@/types';

/** 실시간 입장 현황. 노트북에서 띄워 두는 화면이라 넓은 그리드 (DESIGN.md 4.1) */
export function AdminPage() {
  const eventId = useEventId();
  const [stats, setStats] = useState<EventStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const { event } = useAdmin();
  const draw = useEntryDraws(eventId, !!event?.instantDraw);

  useEffect(() => {
    setError(false);
    try {
      return subscribeEventStats(eventId, (s) => {
        setStats(s);
        setUpdatedAt(Date.now());
      });
    } catch {
      setError(true);
    }
  }, [eventId, retry]);

  const lastEntry = stats?.recent.find((l) => l.result === 'ok');

  return (
    <>
      <PageTitle
        title="실시간 현황"
        description="입장 인원과 부정 시도를 실시간으로 확인해요"
        action={
          <span className="flex items-center gap-2 whitespace-nowrap text-caption text-ink-2">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            실시간{updatedAt && ` · ${formatTime(updatedAt)} 갱신`}
          </span>
        }
      />
      {error ? (
        <StateView
          kind="error"
          title="입장 현황을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>다시 시도</Button>}
        />
      ) : !stats ? (
        <StateView kind="loading" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
          <div className="md:col-span-2 lg:col-span-8">
            <CapacityCard entered={stats.enteredCount} capacity={stats.capacity} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-4 lg:grid-cols-1 lg:gap-6">
            <StatCard icon={XCircle} label="거부된 시도" value={`${stats.rejectedCount}건`} />
            <StatCard icon={Clock} label="마지막 입장" value={lastEntry ? formatTime(lastEntry.at) : '-'} />
          </div>
          {event?.instantDraw && draw.data && (
            <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-12">
              <DrawStatCards data={draw.data} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DrawRateNote data={draw.data} />
                <Link to="/admin/roster" className="flex items-center gap-1 text-label text-ink-2">
                  추첨 결과 보기
                  <ArrowRight size={16} strokeWidth={1.75} />
                </Link>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-12">
            <EntryLogTable logs={stats.recent.slice(0, 8)} />
            <Link to="/admin/entries" className="flex items-center gap-1 self-end text-label text-ink-2">
              전체 입장 기록 보기
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
