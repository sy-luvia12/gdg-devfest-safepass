import { Check, X } from 'lucide-react';
import { formatTime } from '@/app/format';
import type { User, VerifyOutcome } from '@/types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Orb } from './Orb';

type Person = Pick<User, 'name' | 'studentId' | 'photoUrl'>;

export type SheetState = { result: VerifyOutcome; user?: Person; nftTokenId?: string; usedAt?: number };

type Props = {
  state: SheetState;
  onNext: () => void;
  /** needs_confirm일 때 스태프의 답. match true: 같아요 */
  onConfirm?: (match: boolean) => void;
  confirming?: boolean;
  error?: boolean;
};

const reasons: Record<Exclude<VerifyOutcome, 'ok' | 'needs_confirm'>, string> = {
  expired: '만료된 QR이에요. 입장권 화면을 새로고침해 주세요',
  used: '이미 사용된 입장권이에요',
  invalid: '확인할 수 없는 QR이에요',
  wrong_event: '다른 행사 입장권이에요',
  mismatch: '사진 속 얼굴과 달라서 입장을 막았어요',
  signature_invalid: '서명이 없거나 맞지 않는 QR이에요. 학생에게 최신 입장권 화면을 열어 달라고 해 주세요',
  no_pending: '확인 시간이 지났어요. 다시 스캔해 주세요',
};

/** 검표 결과 바텀시트. 떠 있는 동안 스캔은 멈춘다 (DESIGN.md 5장) */
export function ResultSheet({ state, onNext, onConfirm, confirming, error }: Props) {
  if (state.result === 'needs_confirm' && state.user && onConfirm) {
    return <ConfirmSheet user={state.user} onConfirm={onConfirm} loading={confirming} error={error} />;
  }
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
            <p className="text-body text-ink">{reasons[state.result as Exclude<VerifyOutcome, 'ok' | 'needs_confirm'>]}</p>
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

/** 2단계 검표: 사진을 크게 보여주고 스태프가 같은 사람인지 답한다. 답하기 전에는 입장 처리되지 않는다 */
function ConfirmSheet({
  user,
  onConfirm,
  loading,
  error,
}: {
  user: Person;
  onConfirm: (match: boolean) => void;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/20 animate-fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="사진 확인"
        className="flex w-full max-w-app flex-col items-center gap-4 rounded-t-xl bg-bg px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-8 animate-sheet-up"
      >
        <h2 className="text-display text-ink">같은 사람인가요?</h2>
        <Avatar src={user.photoUrl} alt={`${user.name} 사진`} size={200} />
        <div className="text-center">
          <p className="text-title text-ink">{user.name}</p>
          <p className="text-body text-ink-2 tabular">{user.studentId}</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger-bg px-4 py-3 text-center text-label text-danger">
            전달하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요
          </p>
        )}
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button onClick={() => onConfirm(true)} loading={loading} autoFocus>
            같아요
          </Button>
          <Button variant="secondary" onClick={() => onConfirm(false)} disabled={loading}>
            달라요
          </Button>
        </div>
      </section>
    </div>
  );
}
