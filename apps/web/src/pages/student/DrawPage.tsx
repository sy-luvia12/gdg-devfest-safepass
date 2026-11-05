import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleX, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEventId } from '@/app/AuthProvider';
import { CHAIN_EXPLORER } from '@/app/config';
import { formatDateTime } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { Badge, type BadgeTone } from '@/components/Badge';
import { BottomBar, Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StateView } from '@/components/StateView';
import { getChainDraw, getMyLottery, verifyMyDraw, type ChainDraw, type DrawCheck } from '@/lib/api';
import type { MyLottery } from '@/types';

type Data = { lottery: MyLottery; draw: ChainDraw | null };

const STATE: Record<MyLottery['state'], { title: string; tone: BadgeTone; badge: string }> = {
  none: { title: '응모 기록이 없어요', tone: 'muted', badge: '응모 전' },
  waiting: { title: '추첨 대기 중', tone: 'neutral', badge: '대기' },
  won: { title: '당첨', tone: 'success', badge: '축하해요' },
  claimed: { title: '입장권을 받았어요', tone: 'success', badge: '받음' },
  expired: { title: '수락 기한이 지났어요', tone: 'muted', badge: '기한 지남' },
  closed: { title: '추첨이 마감됐어요', tone: 'muted', badge: '마감' },
};

/** 0x8f3a…c21d */
const short = (hex: string) => (hex.length > 14 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex);

/**
 * 추첨 검증 (S7). 추첨 결과를 학생 폰에서 같은 규칙으로 다시 계산한다.
 * 응모 인원·순번·확률은 보여 주지 않는다 (서버도 주지 않는다).
 */
export function DrawPage() {
  const eventId = useEventId();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<DrawCheck | null>(null);
  const [checkError, setCheckError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setData(null);
    setCheck(null);
    getMyLottery(eventId)
      .then(async (lottery) => {
        const r = lottery.receipt;
        const draw = r ? await getChainDraw(r.eventId, r.round) : null;
        setData({ lottery, draw });
      })
      .catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const onVerify = async () => {
    const receipt = data?.lottery.receipt;
    if (!receipt) return;
    setChecking(true);
    setCheckError(false);
    try {
      setCheck(await verifyMyDraw(receipt));
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  };

  const header = <AppHeader title="추첨 검증" back="/event" />;
  if (error)
    return (
      <>
        {header}
        <StateView kind="error" title="추첨 정보를 불러오지 못했어요" action={<Button variant="secondary" onClick={load}>다시 시도</Button>} />
      </>
    );
  if (!data)
    return (
      <>
        {header}
        <StateView kind="loading" />
      </>
    );

  const { lottery, draw } = data;
  const s = STATE[lottery.state];
  const receipt = lottery.receipt;
  const sub =
    lottery.state === 'won' && lottery.offer
      ? `${formatDateTime(lottery.offer.expiresAt)}까지 입장권을 받아 주세요`
      : lottery.state === 'waiting' && lottery.nextAnnounceAt
        ? `다음 발표 ${formatDateTime(lottery.nextAnnounceAt)}`
        : '응모 인원과 순번은 공개하지 않아요';

  return (
    <>
      {header}
      <main className="flex flex-col gap-6 px-5 pb-6 pt-2">
        <Card className="flex flex-col gap-2 bg-surface">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-title text-ink">{s.title}</h2>
            <Badge tone={s.tone}>{s.badge}</Badge>
          </div>
          <p className="text-caption text-ink-2">{sub}</p>
        </Card>

        {!receipt ? (
          <StateView kind="empty" title="검증할 추첨 기록이 없어요" description="취소표 추첨에 들어가면 여기서 결과를 직접 확인할 수 있어요" />
        ) : (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-heading text-ink">추첨 기록 · {receipt.round}회차</h2>
              <Badge tone="neutral">체인 기록</Badge>
            </div>
            <ul className="flex flex-col">
              <Row label="응모 명단 고정값 (추첨 전 공개)" value={draw ? short(draw.commitment) : '기록 전'} tx={draw?.commitTx} />
              <Row label="시드를 정한 블록" value={draw ? `#${draw.seedBlock}` : '기록 전'} />
              <Row label="공개된 시드" value={draw?.seed ? short(draw.seed) : '발표 전'} tx={draw?.seedTx} />
              <Row
                label="내 응모 포함"
                value={check ? (check.included ? '확인됨' : '없음') : '검증 전'}
                tone={check ? (check.included ? 'ok' : 'bad') : undefined}
              />
            </ul>
            <p className="text-caption text-ink-3">
              추첨 전에 응모 명단의 고정값을 올리고, 마감 뒤 블록으로 시드를 정해요. 학생회도 결과를 바꿀 수 없어요
            </p>
          </section>
        )}

        {checkError && (
          <p role="alert" className="rounded-md bg-danger-bg p-4 text-label text-danger">
            체인 기록을 읽지 못했어요. 다시 시도해 주세요
          </p>
        )}
        {check && <Result check={check} />}

      </main>
      {receipt && (
        <BottomBar>
          <Button loading={checking} icon={<ShieldCheck size={20} strokeWidth={1.75} />} onClick={() => void onVerify()}>
            {check ? '다시 검증하기' : '직접 검증하기'}
          </Button>
        </BottomBar>
      )}
    </>
  );
}

function Result({ check }: { check: DrawCheck }) {
  if (check.ok)
    return (
      <div role="status" className="flex flex-col gap-1 rounded-lg bg-success-bg p-4">
        <p className="flex items-center gap-1.5 text-heading text-success">
          <CircleCheck size={18} strokeWidth={1.75} />
          발표 결과와 일치해요
        </p>
        <p className="text-caption text-ink-2">이 폰에서 같은 규칙으로 다시 계산했어요</p>
      </div>
    );
  const reason = !check.included
    ? '내 응모가 추첨 명단에 없어요'
    : !check.commitmentMatches
      ? '추첨 명단이 체인에 올린 값과 달라요'
      : !check.seeded
        ? '아직 시드가 공개되지 않았어요. 내 응모가 명단에 들어간 것까지 확인했어요'
        : '결과를 확인하지 못했어요';
  const pending = check.included && check.commitmentMatches && !check.seeded;
  return (
    <div role="status" className={pending ? 'flex flex-col gap-1 rounded-lg bg-surface p-4' : 'flex flex-col gap-1 rounded-lg bg-danger-bg p-4'}>
      <p className={pending ? 'flex items-center gap-1.5 text-heading text-ink' : 'flex items-center gap-1.5 text-heading text-danger'}>
        {pending ? <ShieldCheck size={18} strokeWidth={1.75} /> : <CircleX size={18} strokeWidth={1.75} />}
        {pending ? '발표 전이에요' : '일치하지 않아요'}
      </p>
      <p className="text-caption text-ink-2">{reason}</p>
    </div>
  );
}

function Row({ label, value, tx, tone }: { label: string; value: string; tx?: string | null; tone?: 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'text-success font-semibold' : tone === 'bad' ? 'text-danger font-semibold' : 'text-ink';
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-3.5 last:border-0">
      <span className="text-body text-ink-2">{label}</span>
      {tx ? (
        <a
          href={`${CHAIN_EXPLORER}/tx/${tx}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-label text-ink underline underline-offset-4"
        >
          {value}
          <ExternalLink size={12} aria-hidden />
        </a>
      ) : (
        <span className={`text-label ${tone ? '' : 'font-mono '}${color}`}>{value}</span>
      )}
    </li>
  );
}
