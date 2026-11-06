import { ExternalLink, Link2, Loader2, CirclePause } from '@/components/icons';
import { CHAIN_CONTRACT, CHAIN_EXPLORER } from '@/app/config';
import type { TicketChain } from '@/types';
import { Badge } from './Badge';

/**
 * 입장권의 온체인 기록. 서버를 거치지 않고 익스플로러에서 직접 확인할 수 있게 링크를 건다.
 * 기록이 없는 입장권(체인 연동 전, mock)은 아무것도 그리지 않는다.
 */
export function ChainRecord({ chain, compact = false }: { chain?: TicketChain; compact?: boolean }) {
  if (!chain) return null;
  if (chain.status === 'pending' && !chain.lastTx) {
    return (
      <Badge tone="muted" icon={<Loader2 size={14} className="animate-spin" aria-hidden />}>
        체인 기록 중
      </Badge>
    );
  }
  if (chain.status === 'blocked') {
    return (
      <Badge tone="warning" icon={<CirclePause size={14} aria-hidden />}>
        체인 기록 대기
      </Badge>
    );
  }
  const href = chain.lastTx
    ? `${CHAIN_EXPLORER}/tx/${chain.lastTx}`
    : CHAIN_CONTRACT && chain.tokenId
      ? `${CHAIN_EXPLORER}/nft/${CHAIN_CONTRACT}/${chain.tokenId}`
      : null;
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-label text-ink-2 underline underline-offset-4">
      <Link2 size={14} aria-hidden />
      {compact ? '체인' : '체인 기록 보기'}
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}
