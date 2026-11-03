import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, ListOrdered, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEventId } from '@/app/AuthProvider';
import { formatDateTime } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { NextStepNote } from '@/components/NextStepNote';
import { StateView } from '@/components/StateView';
import { getEvent, getMyTicket, getTicketHistory } from '@/lib/api';
import type { Event, Ticket, TicketHistoryItem } from '@/types';

const kinds: Record<TicketHistoryItem['type'], { icon: LucideIcon; title: string; cls: string }> = {
  issued: { icon: Sparkles, title: '입장권 발급', cls: 'bg-lavender text-ink' },
  reassigned: { icon: ListOrdered, title: '취소표 배정', cls: 'bg-sky text-ink' },
  used: { icon: CheckCircle2, title: '입장 완료', cls: 'bg-success-bg text-success' },
};

const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

/** 입장권 발급·재배정·입장 기록. 온체인 기록을 사람이 읽을 수 있게 보여준다 */
export function HistoryPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const [data, setData] = useState<{ event: Event; ticket: Ticket | null; items: TicketHistoryItem[] } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    (async () => {
      const [event, ticket] = await Promise.all([getEvent(eventId), getMyTicket(eventId)]);
      const items = ticket ? await getTicketHistory(ticket.id) : [];
      setData({ event, ticket, items });
    })().catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const header = <AppHeader title="발급·입장 기록" back="/ticket" />;

  if (error)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="기록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      </>
    );
  if (!data)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );
  if (!data.ticket)
    return (
      <>
        {header}
        <StateView
          kind="empty"
          title="아직 기록이 없어요"
          description="입장권을 받으면 발급 기록이 여기에 남아요"
          action={<Button onClick={() => navigate('/event')}>입장권 받으러 가기</Button>}
        />
      </>
    );

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-10 pt-2">
        <section className="flex items-center justify-between rounded-lg bg-grad-ticket p-5">
          <div className="min-w-0">
            <p className="text-caption text-ink-2">NFT 입장권</p>
            <p className="truncate text-heading text-ink">{data.event.name}</p>
          </div>
          <p className="text-title text-ink tabular">{data.ticket.nftTokenId}</p>
        </section>

        <ol className="flex flex-col">
          {data.items.map((item, i) => {
            const k = kinds[item.type];
            const Icon = k.icon;
            const last = i === data.items.length - 1;
            return (
              <li key={`${item.type}-${item.at}`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${k.cls}`}>
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  {!last && <span className="w-px flex-1 bg-line" />}
                </div>
                <div className={`min-w-0 flex-1 ${last ? '' : 'pb-6'}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-body text-ink">{k.title}</p>
                    <p className="shrink-0 text-caption text-ink-3 tabular">{formatDateTime(item.at)}</p>
                  </div>
                  <p className="text-caption text-ink-2">{item.detail}</p>
                  <p className="mt-1 font-mono text-caption text-ink-3">기록 {shortHash(item.txHash)}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <NextStepNote>
          입장권 번호와 발급·재배정·입장 기록은 학생회도 고칠 수 없게 블록체인에 남겨 진짜 입장권인지 확인할 수 있어요.
          프로토타입은 표시용 기록이고, 테스트넷 연동은 다음 단계예요.
        </NextStepNote>
      </main>
    </>
  );
}
