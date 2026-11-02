import { Check, UserCheck, X } from 'lucide-react';
import { formatTime } from '@/app/format';
import type { ScanResult, User } from '@/types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Orb } from './Orb';

type Person = Pick<User, 'name' | 'studentId' | 'photoUrl'>;

/** confirm: 2단계 검표에서 사진 대조 중 / done: 최종 결과 */
export type SheetState =
  | { step: 'confirm'; ticketId: string; user: Person; nftTokenId?: string }
  | { step: 'done'; result: ScanResult; user?: Person; nftTokenId?: string; usedAt?: number };

type Props = {
  state: SheetState;
  onNext: () => void;
  onConfirm: (match: boolean) => void;
  confirming: boolean | null; // 누른 버튼 (true: 일치, false: 불일치)
};

const reasons: Record<Exclude<ScanResult, 'ok'>, string> = {
  expired: '만료된 QR이에요. 입장권 화면을 새로고침해 주세요',
  used: '이미 사용된 입장권이에요',
  invalid: '확인할 수 없는 QR이에요',
  mismatch: '사진과 얼굴이 달라서 입장을 거부했어요',
};

/** 검표 결과 바텀시트. 떠 있는 동안 스캔은 멈춘다 (DESIGN.md 5장) */
export function ResultSheet({ state, onNext, onConfirm, confirming }: Props) {
  const ok = state.step === 'done' && state.result === 'ok';
  const title = state.step === 'confirm' ? '본인 확인' : ok ? '입장 완료' : '입장 불가';

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/20 animate-fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-app flex-col items-center gap-4 rounded-t-xl bg-bg px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-8 animate-sheet-up"
      >
        {state.step === 'confirm' ? (
          <>
            <p className="flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-label text-success">
              <Check size={14} strokeWidth={2} />
              유효한 입장권
            </p>
            <h2 className="text-display text-ink">사진과 얼굴이 같나요?</h2>
            <Avatar src={state.user.photoUrl} alt={`${state.user.name} 사진`} size={160} />
            <div className="text-center">
              <p className="text-title text-ink">{state.user.name}</p>
              <p className="text-body text-ink-2 tabular">
                {state.user.studentId}
                {state.nftTokenId && ` · NFT ${state.nftTokenId}`}
              </p>
            </div>
            <div className="mt-2 flex w-full flex-col gap-2">
              <Button
                icon={<UserCheck size={18} strokeWidth={1.75} />}
                loading={confirming === true}
                disabled={confirming !== null}
                onClick={() => onConfirm(true)}
                autoFocus
              >
                같아요, 입장 처리
              </Button>
              <Button
                variant="secondary"
                loading={confirming === false}
                disabled={confirming !== null}
                onClick={() => onConfirm(false)}
              >
                달라요, 입장 거부
              </Button>
            </div>
          </>
        ) : (
          <>
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
                <p className="text-body text-ink">{reasons[state.result as keyof typeof reasons]}</p>
                {state.result === 'used' && state.usedAt && (
                  <p className="mt-1 text-caption text-ink-2">{formatTime(state.usedAt)}에 이미 입장했어요</p>
                )}
                {state.result === 'mismatch' && (
                  <p className="mt-1 text-caption text-ink-2">학생회 현황에 거부 기록으로 남아요</p>
                )}
              </div>
            )}

            <Button className="mt-2" onClick={onNext} autoFocus>
              다음 스캔
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
