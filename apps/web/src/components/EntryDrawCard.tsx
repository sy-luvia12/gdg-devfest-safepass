import { useState } from 'react';
import { CircleCheck, CircleX, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { formatRate, verifyMyEntry, type EntryVerification } from '@/lib/api';
import type { EntryDraw } from '@/types';

/** 0x8f3a…c21d */
const short = (hex: string) => (hex.length > 14 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex);

/**
 * 즉석 추첨 결과 카드 (행사 화면, 공개 현황판 위).
 * 응모가 블록체인에 올라가고, 몇 블록 뒤 블록 해시로 컨트랙트가 당첨을 정한다. 학생은 같은 공식으로 폰에서 다시 계산한다.
 */
export function EntryDrawCard({ entry, entering, error }: { entry: EntryDraw | null; entering: boolean; error: string | null }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<EntryVerification | null>(null);
  const [checkError, setCheckError] = useState(false);

  const onVerify = async () => {
    if (!entry) return;
    setChecking(true);
    setCheckError(false);
    try {
      setResult(await verifyMyEntry(entry));
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  };

  if (error)
    return (
      <Card className="flex flex-col gap-2 bg-surface">
        <h2 className="text-heading text-ink">추첨에 응모하지 못했어요</h2>
        <p className="text-caption text-ink-2">{error}</p>
      </Card>
    );

  if (!entry || entry.status === 'pending')
    return (
      <Card className="flex flex-col gap-3 bg-surface" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-title text-ink">
            <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-ink-2" aria-hidden />
            추첨 중
          </h2>
          <Badge tone="neutral">체인 기록</Badge>
        </div>
        <p className="text-caption text-ink-2">
          {entering || !entry
            ? '응모를 블록체인에 올리고 있어요'
            : `당첨 확률 ${formatRate(entry.winBps)}로 응모했어요. 5블록 뒤에 생기는 블록 해시로 결과가 정해져요 (보통 20초 안팎)`}
        </p>
        <p className="text-caption text-ink-3">결과는 블록체인이 정해요. 학생회도 서버도 바꿀 수 없어요</p>
      </Card>
    );

  const won = entry.status === 'won';
  return (
    <section className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 bg-surface">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-title text-ink">{won ? '당첨' : '아쉽게도 당첨되지 않았어요'}</h2>
          <Badge tone={won ? 'success' : 'muted'}>{won ? '축하해요' : '낙첨'}</Badge>
        </div>
        <p className="text-caption text-ink-2">
          당첨 확률 {formatRate(entry.winBps)} · 정원과 재학생 수로 정해진 확률이에요
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-heading text-ink">추첨 기록</h3>
          <Badge tone="neutral">체인 기록</Badge>
        </div>
        <ul className="flex flex-col">
          <Row label="응모 번호" value={short(entry.entryId)} />
          <Row label="결과를 정한 블록" value={entry.seedBlock !== null ? `#${entry.seedBlock.toLocaleString('ko-KR')}` : '-'} />
          <Row label="블록 해시 (시드)" value={entry.seed ? short(entry.seed) : '-'} />
          <Row label="내 점수 / 당첨 기준" value={entry.score !== null ? `${entry.score} / ${entry.winBps} 미만` : '-'} />
        </ul>
        <p className="text-caption text-ink-3">
          점수는 블록 해시와 응모 번호로 계산해요. 0~9999 중 당첨 기준보다 작으면 당첨이에요
        </p>
      </div>

      <Button variant="secondary" loading={checking} icon={<ShieldCheck size={20} strokeWidth={1.75} />} onClick={() => void onVerify()}>
        {result ? '다시 검증하기' : '직접 검증하기'}
      </Button>
      {checkError && (
        <p role="alert" className="rounded-md bg-danger-bg p-4 text-label text-danger">
          체인 기록을 읽지 못했어요. 다시 시도해 주세요
        </p>
      )}
      {result && <VerifyResult v={result} />}
    </section>
  );
}

function VerifyResult({ v }: { v: EntryVerification }) {
  const { check, links } = v;
  const linkRow = (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {links.open && <TxLink href={links.open} label="응모 거래" />}
      {links.settle && <TxLink href={links.settle} label="결과 거래" />}
      {links.block && <TxLink href={links.block} label="시드 블록" />}
    </div>
  );
  if (check.ok)
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg bg-success-bg p-4">
        <p className="flex items-center gap-1.5 text-heading text-success">
          <CircleCheck size={18} strokeWidth={1.75} />
          체인 기록과 일치해요
        </p>
        <p className="text-caption text-ink-2">
          이 폰에서 같은 공식으로 다시 계산했어요. 점수 {check.score}
          {check.capacityFull ? ' · 당첨 범위였지만 정원이 먼저 차서 낙첨됐어요' : ''}
        </p>
        {linkRow}
      </div>
    );
  const reason = !check.onChain
    ? '체인에 아직 결과가 없어요'
    : !check.entryIdMatches
      ? '내 정보로 다시 만든 응모 번호가 달라요'
      : !check.rateMatches
        ? '체인에 고정된 당첨 확률이 안내받은 확률과 달라요'
        : !check.seedMatches
          ? '시드가 그 블록의 해시와 달라요'
          : !check.scoreMatches
            ? '다시 계산한 점수가 체인 기록과 달라요'
            : '다시 계산한 결과가 체인 결과와 달라요';
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg bg-danger-bg p-4">
      <p className="flex items-center gap-1.5 text-heading text-danger">
        <CircleX size={18} strokeWidth={1.75} />
        일치하지 않아요
      </p>
      <p className="text-caption text-ink-2">{reason}</p>
      {linkRow}
    </div>
  );
}

function TxLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption text-ink-2 underline underline-offset-4">
      {label}
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-3.5 last:border-0">
      <span className="text-body text-ink-2">{label}</span>
      <span className="font-mono text-label text-ink">{value}</span>
    </li>
  );
}
