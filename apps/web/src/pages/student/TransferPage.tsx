import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEventId } from '@/app/AuthProvider';
import { formatWon } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Orb } from '@/components/Orb';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { getEvent, getMyTicket, transferTicket } from '@/lib/api';
import { ApiError, type Event, type Ticket, type TransferReason } from '@/types';

const reasonText: Record<TransferReason, string> = {
  over_face_value: '정가보다 높은 가격으로는 양도할 수 없어요',
  not_student: '재학생 학교 계정으로만 양도할 수 있어요',
  already_has_ticket: '받는 분이 이미 입장권을 갖고 있어요',
};

export function TransferPage() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  const [email, setEmail] = useState('');
  const [price, setPrice] = useState('0');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([getEvent(eventId), getMyTicket(eventId)])
      .then(([e, t]) => {
        setEvent(e);
        setTicket(t);
      })
      .catch(() => setLoadError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const priceNum = Number(price.replace(/[^0-9]/g, '') || '0');
  const overPrice = event !== null && priceNum > event.faceValue;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticket || !event || overPrice) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError('받는 분의 학교 이메일을 입력해 주세요');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setEmailError(null);
    try {
      const tr = await transferTicket(ticket.id, email.trim(), priceNum);
      if (tr.result === 'success') return setDone(true);
      const msg = tr.reason ? reasonText[tr.reason] : '양도하지 못했어요';
      if (tr.reason === 'over_face_value') setSubmitError(msg);
      else setEmailError(msg);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.code === 'invalid_state'
          ? '이미 보내는 중인 양도 요청이 있어요. 먼저 취소해 주세요'
          : '양도하지 못했어요. 다시 시도해 주세요',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const header = <AppHeader title="양도하기" back="/ticket" />;

  if (done)
    return (
      <>
        {header}
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 pb-36 text-center md:pb-10">
          <Orb size={160} tone="success">
            <Send size={36} strokeWidth={1.75} className="text-success" />
          </Orb>
          <div className="flex flex-col gap-2">
            <h2 className="text-display text-ink">양도 요청을 보냈어요</h2>
            <p className="text-body text-ink-2">{email.trim()} 님이 수락하면 입장권이 넘어가요</p>
            <p className="text-caption text-ink-3">수락하기 전에는 내 입장권 화면에서 취소할 수 있어요</p>
          </div>
        </main>
        <BottomBar>
          <Button onClick={() => navigate('/ticket', { replace: true })}>확인</Button>
        </BottomBar>
      </>
    );
  if (loadError)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="입장권을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      </>
    );
  if (ticket === undefined || !event)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );
  if (!ticket || ticket.status === 'used')
    return (
      <>
        {header}
        <StateView
          kind="empty"
          title="양도할 수 있는 입장권이 없어요"
          description={ticket ? '이미 사용한 입장권은 양도할 수 없어요' : undefined}
          action={<Button variant="secondary" onClick={() => navigate('/ticket')}>내 입장권으로</Button>}
        />
      </>
    );

  const hint =
    event.faceValue === 0
      ? '무료 입장권이라 0원으로만 양도할 수 있어요'
      : `정가 ${formatWon(event.faceValue)} 이하로만 양도할 수 있어요`;

  return (
    <>
      {header}
      <form onSubmit={onSubmit} className="flex flex-col">
        <main className="flex flex-col gap-6 px-5 pb-36 pt-2 md:pb-0">
          <Card className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-heading text-ink">{event.name}</p>
              <p className="text-caption text-ink-2 tabular">NFT {ticket.nftTokenId}</p>
            </div>
            <div className="text-right">
              <p className="text-caption text-ink-2">정가</p>
              <p className="text-heading text-ink tabular">{formatWon(event.faceValue)}</p>
            </div>
          </Card>

          <TextField
            label="받는 사람 학교 이메일"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@univ.ac.kr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            error={emailError ?? undefined}
          />
          <TextField
            label="양도 가격"
            inputMode="numeric"
            value={price}
            suffix="원"
            onChange={(e) => {
              setPrice(e.target.value.replace(/[^0-9]/g, ''));
              setSubmitError(null);
            }}
            error={overPrice ? reasonText.over_face_value : (submitError ?? undefined)}
            hint={hint}
          />
        </main>
        <BottomBar>
          <Button type="submit" loading={submitting} disabled={overPrice || !email}>
            양도 요청 보내기
          </Button>
        </BottomBar>
      </form>
    </>
  );
}
