import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, Calendar, MapPin, ShieldCheck, UserCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useEventId } from '@/app/AuthProvider';
import { formatEventDate, formatWon } from '@/app/format';
import { useMyTransfers } from '@/app/useMyTransfers';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { IncomingTransferBanner } from '@/components/IncomingTransferBanner';
import { StateView } from '@/components/StateView';
import { getEvent, getMyTicket, issueTicket } from '@/lib/api';
import { ApiError, type Event, type Ticket } from '@/types';

type Data = { event: Event; ticket: Ticket | null };

export function EventPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const { school } = useAuth();
  const { incoming } = useMyTransfers();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([getEvent(eventId), getMyTicket(eventId)])
      .then(([event, ticket]) => setData({ event, ticket }))
      .catch(() => setLoadError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const onIssue = async () => {
    setIssuing(true);
    setIssueError(null);
    try {
      await issueTicket(eventId);
      navigate('/ticket');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      setIssueError(
        code === 'sold_out'
          ? '모두 발급되었어요'
          : code === 'not_school_account'
            ? '학교 계정으로만 받을 수 있어요'
            : code === 'not_in_roster'
              ? '학생회 명단에 없어서 받을 수 없어요. 학생회에 문의해 주세요'
              : '입장권을 받지 못했어요. 다시 시도해 주세요',
      );
      setIssuing(false);
    }
  };

  const header = (
    <AppHeader title="축제 정보" right={<IconButton icon={UserRound} label="내 정보" onClick={() => navigate('/me')} />} />
  );

  if (loadError)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="축제 정보를 불러오지 못했어요"
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

  const { event, ticket } = data;
  const remaining = Math.max(0, event.capacity - event.issuedCount);
  const soldOut = remaining === 0 && !ticket;

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-36 pt-2 md:pb-10">
        {!ticket && <IncomingTransferBanner transfers={incoming} />}
        <section className="flex aspect-[4/3] flex-col justify-end gap-2 rounded-xl bg-grad-ticket p-6 shadow-float">
          <p className="text-label text-ink-2">{school?.name} 재학생 전용</p>
          <h2 className="text-title text-ink">{event.name}</h2>
          <div className="flex flex-col gap-1 text-body text-ink-2">
            <span className="flex items-center gap-2">
              <Calendar size={16} strokeWidth={1.75} />
              {formatEventDate(event.date)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={16} strokeWidth={1.75} />
              {event.place}
            </span>
          </div>
        </section>

        <Card padded={false} className="grid grid-cols-3 divide-x divide-line">
          <Info label="정원" value={`${event.capacity.toLocaleString('ko-KR')}명`} />
          <Info label="정가" value={formatWon(event.faceValue)} />
          <Info label="남은 수량" value={`${remaining.toLocaleString('ko-KR')}매`} />
        </Card>

        <ul className="flex flex-col gap-3">
          <Guide icon={UserCheck} text="학교 계정 1개당 1매만 받을 수 있어요" />
          <Guide icon={ShieldCheck} text="입장할 때 사진으로 본인 확인을 해요. 본인만 입장할 수 있어요" />
          <Guide icon={ArrowLeftRight} text="못 가게 되면 정가 이하로만 다른 재학생에게 양도할 수 있어요" />
        </ul>
      </main>

      <BottomBar>
        {issueError && <p role="alert" className="text-center text-caption text-danger">{issueError}</p>}
        {ticket ? (
          <Button onClick={() => navigate('/ticket')}>내 입장권 보기</Button>
        ) : soldOut ? (
          <Button disabled>모두 발급되었어요</Button>
        ) : (
          <Button loading={issuing} onClick={onIssue}>
            입장권 받기
          </Button>
        )}
      </BottomBar>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <span className="text-caption text-ink-2">{label}</span>
      <span className="text-heading text-ink tabular">{value}</span>
    </div>
  );
}

function Guide({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-start gap-3 text-caption text-ink-2">
      <Icon size={16} strokeWidth={1.75} className="mt-px shrink-0" />
      {text}
    </li>
  );
}
