import { Check, X } from 'lucide-react';
import { formatTime } from '@/app/format';
import type { User, VerifyResult } from '@/types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Orb } from './Orb';

type Person = Pick<User, 'name' | 'studentId' | 'photoUrl'>;

export type SheetState = { result: VerifyResult['result']; user?: Person; nftTokenId?: string; usedAt?: number };

type Props = { state: SheetState; onNext: () => void };

const reasons: Record<Exclude<VerifyResult['result'], 'ok'>, string> = {
  expired: '만료된 QR이에요. 입장권 화면을 새로고침해 주세요',
  used: '이미 사용된 입장권이에요',
  invalid: '확인할 수 없는 QR이에요',
  wrong_event: '다른 행사 입장권이에요',
};

/** 검표 결과 바텀시트. 떠 있는 동안 스캔은 멈춘다 (DESIGN.md 5장) */
export function ResultSheet({ state, onNext }: Props) {
  const ok = state.result === 'ok';
  const title = ok ? '입장 완료' : '입장 불가';

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/20 animate-fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-app flex-col items-center gap-4 rounded-t-xl bg-bg px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-8 animate-sheet-up"
      >
        <Orb size={96} tone={ok ? 'success' : 'warm'}>
          {ok ? (
            <Check size={36} strokeWidth={2} className="text-success" />
          ) : (
            <X size={36} strokeWidth={2} className="text-danger" />
          )}
        </Orb>
        <h2 className="text-display text-ink">{title}</h2>

        {ok && state.user ? (
          <>
            <Avatar src={state.user.photoUrl} alt={`${state.user.name} 사진`} size={120} />
            <div className="text-center">
              <p className="text-title text-ink">{state.user.name}</p>
              <p className="text-body text-ink-2 tabular">
                {state.user.studentId}
                {state.nftTokenId && ` · NFT ${state.nftTokenId}`}
              </p>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-body text-ink">{reasons[state.result as Exclude<VerifyResult['result'], 'ok'>]}</p>
            {state.result === 'used' && state.usedAt && (
              <p className="mt-1 text-caption text-ink-2">{formatTime(state.usedAt)}에 이미 입장했어요</p>
            )}
          </div>
        )}

        <Button className="mt-2" onClick={onNext} autoFocus>
          다음 스캔
        </Button>
      </section>
    </div>
  );
}
