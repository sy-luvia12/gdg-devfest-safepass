import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, ExternalLink, TriangleAlert } from 'lucide-react';
import { useEventId } from '@/app/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StateView } from '@/components/StateView';
import { getChainEventStatus, type ChainEventStatus } from '@/lib/api';

const n = (v: number) => v.toLocaleString('ko-KR');

/**
 * 공개 현황판 (S8). 서버를 거치지 않고 체인(컨트랙트)에서 직접 읽은 숫자만 보여 준다.
 * 개인 정보는 없다. 체인에 없는 운영 기록(환불, 분실 재발급 등)은 만들어 넣지 않는다.
 */
export function BoardPage() {
  const eventId = useEventId();
  const [status, setStatus] = useState<ChainEventStatus | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setStatus(null);
    getChainEventStatus(eventId).then(setStatus).catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const header = <AppHeader title="공개 현황판" back="/event" />;
  if (error)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="체인 기록을 읽지 못했어요"
          description="잠시 후 다시 시도해 주세요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      </>
    );
  if (!status)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );
  if (!status.exists)
    return (
      <>
        {header}
        <StateView kind="empty" title="아직 체인에 기록되지 않은 행사예요" description="첫 입장권이 발급되면 여기에 공개돼요" />
      </>
    );

  const pct = status.capacity > 0 ? Math.min(100, Math.round((status.active / status.capacity) * 100)) : 0;
  const reassigned = status.reassigned.queue + status.reassigned.lottery;

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-10 pt-2">
        <p className="text-body text-ink-2">
          입장권 발행과 재배정은 블록체인에 기록돼요. 학생회도 이 숫자를 고칠 수 없어요
        </p>

        {/* 그라데이션 포인트: 발행량 / 정원 */}
        <section className="relative overflow-hidden rounded-xl p-6 shadow-float">
          <div className="absolute inset-0 bg-grad-ticket opacity-60" />
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-label text-ink-2">발행량 / 정원</h2>
              <Badge tone="neutral">체인 기록</Badge>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-number tabular text-ink">{n(status.active)}</span>
              <span className="text-heading tabular text-ink-2">/ {n(status.capacity)}</span>
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
              <div className="h-full rounded-full bg-ink transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
            </div>
            {status.withinCapacity ? (
              <p className="flex items-center gap-1.5 text-label text-success">
                <CircleCheck size={16} strokeWidth={1.75} />
                발행량은 정원을 넘을 수 없어요 (컨트랙트가 막아요)
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-label text-danger">
                <TriangleAlert size={16} strokeWidth={1.75} />
                발행량이 정원과 맞지 않아요
              </p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="누적 발급" value={`${n(status.issued)}장`} />
          <Stat label="재배정" value={`${n(reassigned)}건`} />
          <Stat label="입장" value={`${n(status.used)}명`} />
        </div>

        {status.entries.settled > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-heading text-ink">추첨 결과</h2>
              <Badge tone="neutral">체인 기록</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="응모" value={`${n(status.entries.settled)}명`} />
              <Stat label="당첨" value={`${n(status.entries.won)}명`} />
              <Stat label="경쟁률" value={status.entries.won > 0 ? `${(status.entries.settled / status.entries.won).toFixed(1)} : 1` : '-'} />
            </div>
            <p className="flex items-center gap-1.5 text-label text-success">
              <CircleCheck size={16} strokeWidth={1.75} />
              당첨자 수는 정원을 넘을 수 없어요 (컨트랙트가 막아요)
            </p>
            <p className="text-caption text-ink-3">응모마다 블록 해시로 컨트랙트가 결과를 정해요. 학생은 행사 화면에서 직접 검증할 수 있어요</p>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-heading text-ink">운영진 개입 기록</h2>
            <Badge tone="neutral">체인 기록</Badge>
          </div>
          <ul className="flex flex-col">
            <Row label="부정 적발 회수" value={`${n(status.released.adminRevoke)}건`} strong />
            <Row label="분실 재발급" value={`${n(status.actions.lostReissue)}건`} strong />
            <Row label="환불" value={`${n(status.actions.refund)}건`} strong />
            <Row label="예외 입장 (대면 확인)" value={`${n(status.actions.manualEntry)}건`} strong />
          </ul>
          <p className="text-caption text-ink-3">운영진이 입장권에 손대면 사유와 함께 체인에 남아요. 지우거나 숨길 수 없어요</p>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-heading text-ink">취소표 기록</h2>
            <Badge tone="neutral">체인 기록</Badge>
          </div>
          <ul className="flex flex-col">
            <Row label="대기 순서로 재배정" value={`${n(status.reassigned.queue)}건`} />
            <Row label="추첨으로 재배정" value={`${n(status.reassigned.lottery)}건`} />
            <Row label="대기자가 없어 반납" value={`${n(status.released.noWaiter)}건`} />
          </ul>
        </section>

        <div className="flex flex-col items-center gap-2 text-center">
          <a
            href={status.contractUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-label text-ink-2 underline underline-offset-4"
          >
            컨트랙트에서 직접 확인하기
            <ExternalLink size={12} aria-hidden />
          </a>
          <p className="text-caption text-ink-3">블록 #{status.asOfBlock} 기준 · 개인 정보는 표시하지 않아요</p>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-caption text-ink-2">{label}</span>
      <span className="text-heading tabular text-ink">{value}</span>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-line py-3.5 last:border-0">
      <span className="text-body text-ink">{label}</span>
      <span className={strong ? 'text-body font-semibold tabular text-ink' : 'text-body tabular text-ink-2'}>{value}</span>
    </li>
  );
}
