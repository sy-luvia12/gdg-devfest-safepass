import { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { studentGatePath } from '@/app/config';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { cx } from '@/components/cx';
import { ImagePicker } from '@/components/ImagePicker';
import { submitVerification } from '@/lib/api';

const STEPS = ['동의', '본인 사진', '학생증', '확인'] as const;

const AGREEMENTS = [
  { key: 'collect', text: '이름, 학번, 학교 이메일, 얼굴 사진, 학생증 사진을 입장 확인 목적으로 수집하는 데 동의해요' },
  { key: 'show', text: '입장할 때 검표 스태프에게 내 사진·이름·학번이 보이는 데 동의해요' },
  { key: 'delete', text: '행사가 끝나고 7일 뒤 사진과 입장 기록이 삭제된다는 것을 확인했어요' },
] as const;

/** 첫 로그인: 동의 → 본인 사진 → 학생증 사진 → 학생회 승인 요청 (기술 설계 2.3) */
export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshUser, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [idCard, setIdCard] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  if (!user) return null;
  const gate = studentGatePath(user);
  if (gate !== '/onboarding') return <Navigate to={gate ?? '/ticket'} replace />;

  const allAgreed = AGREEMENTS.every((a) => agreed[a.key]);
  const canNext = [allAgreed, !!photo, !!idCard, true][step];

  const onNext = async () => {
    if (step < STEPS.length - 1) return setStep(step + 1);
    if (!photo || !idCard) return;
    setSubmitting(true);
    setError(false);
    try {
      await submitVerification(photo, idCard);
      await refreshUser();
      navigate('/onboarding/pending', { replace: true });
    } catch {
      setError(true);
      setSubmitting(false);
    }
  };

  return (
    <>
      <AppHeader
        title="재학생 확인"
        right={
          <Button variant="ghost" size="sm" onClick={signOut}>
            나가기
          </Button>
        }
      />
      <main className="flex flex-col gap-6 px-5 pb-36 pt-2 md:pb-10">
        <ol className="grid grid-cols-4 gap-2" aria-label="진행 단계">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-col gap-1.5">
              <span className={cx('h-1 rounded-full', i <= step ? 'bg-ink' : 'bg-surface-2')} />
              <span className={cx('text-caption', i === step ? 'text-ink' : 'text-ink-3')}>{label}</span>
            </li>
          ))}
        </ol>

        {user.verifyStatus === 'rejected' && step === 0 && (
          <p className="flex items-start gap-2 rounded-md bg-danger-bg px-4 py-3 text-label text-danger">
            <AlertCircle size={16} strokeWidth={1.75} className="mt-px shrink-0" />
            지난 요청이 반려됐어요: {user.rejectReason}
          </p>
        )}

        {step === 0 && (
          <section className="flex flex-col gap-5">
            <div>
              <h2 className="text-title text-ink">{user.name}님, 반가워요</h2>
              <p className="mt-1 text-body text-ink-2">
                입장권은 재학생 본인만 쓸 수 있어요. 학생회가 학생증과 사진을 확인한 뒤 발급받을 수 있어요.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {AGREEMENTS.map((a) => (
                <li key={a.key}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface p-4">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={!!agreed[a.key]}
                      onChange={(e) => setAgreed((p) => ({ ...p, [a.key]: e.target.checked }))}
                    />
                    <span
                      className={cx(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-lavender',
                        agreed[a.key] ? 'border-ink bg-ink text-white' : 'border-ink-3 bg-bg',
                      )}
                    >
                      {agreed[a.key] && <Check size={12} strokeWidth={2.5} />}
                    </span>
                    <span className="text-label text-ink">
                      <span className="text-ink-2">[필수] </span>
                      {a.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setAgreed(Object.fromEntries(AGREEMENTS.map((a) => [a.key, !allAgreed])))}
              className="self-start text-label text-ink-2 underline underline-offset-4"
            >
              {allAgreed ? '모두 해제' : '모두 동의'}
            </button>
          </section>
        )}

        {step === 1 && (
          <section className="flex flex-col gap-5">
            <div>
              <h2 className="text-title text-ink">본인 사진을 올려 주세요</h2>
              <p className="mt-1 text-body text-ink-2">검표할 때 스태프가 이 사진과 얼굴을 대조해요</p>
            </div>
            <ImagePicker label="본인 사진" hint="정면 얼굴이 잘 보이는 사진" value={photo} onChange={setPhoto} shape="face" />
            <ul className="flex flex-col gap-1 text-caption text-ink-2">
              <li>· 모자, 선글라스, 마스크 없이 정면으로</li>
              <li>· 승인 후에는 사진을 바꿀 수 없어요</li>
            </ul>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-5">
            <div>
              <h2 className="text-title text-ink">학생증을 찍어 주세요</h2>
              <p className="mt-1 text-body text-ink-2">학생회가 본인 사진과 학생증을 비교해 재학생인지 확인해요</p>
            </div>
            <ImagePicker label="학생증 앞면" hint="이름과 학번이 보이게" value={idCard} onChange={setIdCard} shape="card" />
            <p className="text-caption text-ink-2">학생증 사진은 학생회만 볼 수 있고, 승인 후 행사 종료 7일 뒤 삭제돼요</p>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col gap-5">
            <h2 className="text-title text-ink">이대로 보낼까요?</h2>
            <div className="grid grid-cols-[96px_1fr] items-center gap-4 rounded-lg border border-line p-4">
              {photo && <img src={photo} alt="본인 사진" className="h-24 w-24 rounded-full object-cover" />}
              <div>
                <p className="text-heading text-ink">{user.name}</p>
                <p className="text-caption text-ink-2 tabular">{user.studentId}</p>
                <p className="text-caption text-ink-2">{user.email}</p>
              </div>
            </div>
            {idCard && <img src={idCard} alt="학생증" className="w-full rounded-lg border border-line object-cover" />}
            <p className="text-caption text-ink-2">학생회 확인은 보통 하루 안에 끝나요. 승인되면 입장권을 받을 수 있어요.</p>
          </section>
        )}
      </main>

      <BottomBar>
        {error && <p role="alert" className="text-center text-caption text-danger">보내지 못했어요. 다시 시도해 주세요</p>}
        <Button loading={submitting} disabled={!canNext} onClick={onNext}>
          {step === STEPS.length - 1 ? '승인 요청 보내기' : '다음'}
        </Button>
        {step > 0 && (
          <Button variant="ghost" disabled={submitting} onClick={() => setStep(step - 1)}>
            이전
          </Button>
        )}
      </BottomBar>
    </>
  );
}
