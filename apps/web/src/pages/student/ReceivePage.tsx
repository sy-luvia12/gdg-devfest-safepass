import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, Lock, ShieldCheck, Ticket as TicketIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatAgo, formatPrice } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Orb } from '@/components/Orb';
import { StateView } from '@/components/StateView';
import { acceptTransfer, declineTransfer, getTransfer } from '@/lib/api';
import { ApiError, type TransferView } from '@/types';

const closedText: Record<Exclude<TransferView['result'], 'pending'>, string> = {
  success: '이미 받은 입장권이에요',
  rejected: '규칙에 맞지 않아 취소된 양도예요',
  declined: '거절한 양도예요',
  cancelled: '보낸 분이 양도를 취소했어요',
};

/** 받는 학생: 양도 요청을 확인하고 수락 또는 거절 (기술 설계 2.1 buy) */
export function ReceivePage() {
  const { transferId = '' } = useParams();
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState<TransferView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    getTransfer(transferId).then(setTransfer).catch(() => setLoadError(true));
  }, [transferId]);
  useEffect(load, [load]);

  const act = async (kind: 'accept' | 'decline') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'accept') {
        await acceptTransfer(transferId);
        setAccepted(true);
      } else {
        await declineTransfer(transferId);
        navigate('/ticket', { replace: true });
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'invalid_state'
          ? '받을 수 없는 상태예요. 이미 입장권이 있거나 보낸 분이 취소했어요'
          : '처리하지 못했어요. 다시 시도해 주세요',
      );
      load();
    } finally {
      setBusy(null);
    }
  };

  const header = <AppHeader title="입장권 받기" back="/ticket" />;

  if (accepted)
    return (
      <>
        {header}
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 pb-36 text-center md:pb-10">
          <Orb size={160} tone="success">
            <Check size={40} strokeWidth={2} className="text-success" />
          </Orb>
          <div className="flex flex-col gap-2">
            <h2 className="text-display text-ink">입장권을 받았어요</h2>
            <p className="text-body text-ink-2">이제 내 계정에서만 입장할 수 있어요</p>
          </div>
        </main>
        <BottomBar>
          <Button onClick={() => navigate('/ticket', { replace: true })}>내 입장권 보기</Button>
        </BottomBar>
      </>
    );
  if (loadError)
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="양도 요청을 찾지 못했어요"
          description="링크가 맞는지 확인해 주세요"
          action={<Button variant="secondary" onClick={() => navigate('/ticket')}>내 입장권으로</Button>}
        />
      </>
    );
  if (!transfer)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );

  const result = transfer.result;
  const open = result === 'pending';

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-40 pt-2 md:pb-10">
        <section className="flex flex-col gap-4 rounded-xl bg-grad-ticket p-6 shadow-float">
          <p className="text-label text-ink-2">{transfer.fromName}님이 보낸 입장권</p>
          <h2 className="text-title text-ink">{transfer.eventName}</h2>
          <p className="flex items-center gap-2 text-body text-ink-2">
            <TicketIcon size={16} strokeWidth={1.75} />
            NFT {transfer.nftTokenId}
          </p>
        </section>

        <Card padded={false} className="divide-y divide-line">
          <Row label="보낸 사람" value={transfer.fromName} />
          <Row label="양도 가격" value={formatPrice(transfer.price)} strong />
          <Row label="요청 시각" value={formatAgo(transfer.createdAt)} />
        </Card>

        {result === 'pending' ? (
          <ul className="flex flex-col gap-3">
            <Guide icon={ShieldCheck} text="정가 이하 가격인지 SafePass가 이미 확인했어요" />
            <Guide icon={Lock} text="받으면 입장권과 대금이 한 번에 옮겨지고, 되돌릴 수 없어요" />
          </ul>
        ) : (
          <p className="rounded-md bg-surface px-4 py-3 text-center text-label text-ink-2">{closedText[result]}</p>
        )}
      </main>

      {open && (
        <BottomBar>
          {error && <p role="alert" className="text-center text-caption text-danger">{error}</p>}
          <Button loading={busy === 'accept'} disabled={busy !== null} onClick={() => act('accept')}>
            {transfer.price > 0 ? `${formatPrice(transfer.price)} 내고 받기` : '입장권 받기'}
          </Button>
          <Button variant="ghost" loading={busy === 'decline'} disabled={busy !== null} onClick={() => act('decline')}>
            거절하기
          </Button>
        </BottomBar>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-body text-ink-2">{label}</span>
      <span className={strong ? 'text-heading text-ink tabular' : 'text-body text-ink'}>{value}</span>
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
