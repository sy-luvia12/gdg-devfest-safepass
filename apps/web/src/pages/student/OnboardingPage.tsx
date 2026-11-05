import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { studentGatePath } from '@/app/config';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { ImagePicker } from '@/components/ImagePicker';
import { RegistrationSteps } from '@/components/RegistrationSteps';
import { StateView } from '@/components/StateView';
import { submitProfilePhoto } from '@/lib/api';
import { studentAuthMessage } from '@/lib/studentAuthForm';

/** 메일 링크와 명단 대조가 끝난 학생의 마지막 가입 단계. */
export function OnboardingPage() {
  const { user, refreshUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  if (!user) return null;
  if (finished) return (
    <>
      <AppHeader title="회원가입 완료" />
      <StateView kind="success" title="회원가입이 완료됐어요" description="메일 인증과 사진 등록을 마쳤어요. 이제 축제를 확인하고 입장권을 받을 수 있어요." action={<Button onClick={() => navigate('/', { replace: true })}>축제 보러 가기</Button>} />
    </>
  );
  const gate = studentGatePath(user);
  if (gate !== '/onboarding') return <Navigate to="/" replace />;
  const finish = async () => {
    if (lock.current || !photo || !consented || processing) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await submitProfilePhoto(photo);
      if (saved.verifyStatus !== 'approved') throw new Error('사진 등록 확인 실패');
      const current = await refreshUser();
      if (!current) throw new Error('로그인 정보 확인 실패');
      setFinished(true); setPhoto(null);
    } catch (cause) { setError(studentAuthMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <>
      <AppHeader title="회원가입" right={<Button variant="ghost" size="sm" disabled={busy} onClick={() => void signOut()}>나가기</Button>} />
      <main className="px-5 pb-36 pt-6 md:pb-10">
        <RegistrationSteps step={2} />
        <section className="flex animate-rise-in flex-col gap-6">
          <div>
            <h2 className="text-title text-ink">본인 사진을 등록해 주세요</h2>
            <p className="mt-2 text-body text-ink-2">{user.name}님, 입장할 때 스태프가 사진과 얼굴을 확인해요.</p>
          </div>
          <ImagePicker label="본인 사진" hint="정면 얼굴이 잘 보이는 사진" value={photo} onChange={setPhoto} shape="face" disabled={busy} onProcessingChange={setProcessing} />
          <p className="text-caption text-ink-2">모자·선글라스·마스크 없이 정면을 촬영해 주세요. 노트북에서는 기존 이미지를 업로드해도 돼요.</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface p-4 text-label text-ink">
            <input type="checkbox" disabled={busy} checked={consented} onChange={(event) => setConsented(event.target.checked)} className="mt-1 accent-ink" />
            <span>[필수] 이름·학번·학교 이메일·본인 사진을 입장 시 본인 확인 목적으로 수집하고 검표 스태프에게 표시하는 데 동의해요.</span>
          </label>
          {error && <p role="alert" className="rounded-md bg-danger-bg p-4 text-label text-danger">{error}</p>}
        </section>
        <BottomBar>
          <Button loading={busy} disabled={!photo || !consented || processing} onClick={() => void finish()}>회원가입 완료하기</Button>
        </BottomBar>
      </main>
    </>
  );
}
