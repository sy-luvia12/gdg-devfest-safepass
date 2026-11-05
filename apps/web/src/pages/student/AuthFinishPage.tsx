import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { completeSignInLink, isSignInLink, pendingSignInEmail } from '@/lib/api';
import { studentAuthMessage } from '@/lib/studentAuthForm';
import type { User } from '@/types';

/** 공개 콜백. 링크 소비는 StrictMode에서도 한 번만 하고, 완료 후 계정·학교 범위를 갱신한다. */
export function AuthFinishPage() {
  const { refreshUser, loading } = useAuth();
  const [href] = useState(() => window.location.href);
  const valid = isSignInLink(href);
  const [address, setAddress] = useState(() => pendingSignInEmail() ?? '');
  const [email, setEmail] = useState(() => pendingSignInEmail() ?? '');
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const request = useRef<Promise<User> | null>(null);

  useEffect(() => {
    if (loading || !valid || !email) return;
    let active = true;
    const linkRequest = request.current ?? completeSignInLink(href, email);
    request.current = linkRequest;
    void (async () => {
      try {
        try { await linkRequest; }
        catch (cause) { if (request.current === linkRequest) request.current = null; throw cause; }
        if (!active) return;
        const current = await refreshUser();
        if (!current) throw new Error('로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.');
        if (active) setDone(true);
      } catch (cause) { if (active) setError(studentAuthMessage(cause)); }
    })();
    return () => { active = false; };
  }, [email, href, valid, refreshUser, retry, loading]);

  if (done) return <Navigate to="/" replace />;
  if (!valid) return <StateView kind="error" title="올바른 인증 링크가 아니에요" description="메일에서 받은 링크를 열거나 새 인증 메일을 요청해 주세요." action={<Link to="/signin" className="text-link underline">로그인으로 돌아가기</Link>} />;
  if (email && !error) return <StateView kind="loading" fullScreen title="메일과 기기를 확인하고 있어요" description="링크 확인 후 가입 상태에 맞는 화면으로 이동해요." />;
  return (
    <>
      <AppHeader title="메일 인증" back="/" />
      <main className="flex flex-col gap-6 px-5 py-8">
        <h2 className="text-title text-ink">인증 메일을 받은 주소를 확인해 주세요</h2>
        <p className="text-body text-ink-2">다른 브라우저에서 링크를 열었다면 메일 주소를 다시 입력해 주세요. 인증을 마친 이 브라우저가 입장권을 보여 줄 기기로 등록돼요.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const normalized = address.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setError('올바른 이메일 주소를 입력해 주세요.'); return; }
          if (normalized !== email) request.current = null;
          setError(''); setEmail(normalized); setRetry((value) => value + 1);
        }} className="flex flex-col gap-5">
          <TextField label="학교 이메일" type="email" autoComplete="email" value={address} onChange={(event) => setAddress(event.target.value)} />
          {error && <p role="alert" className="rounded-md bg-danger-bg p-4 text-label text-danger">{error}</p>}
          <Button type="submit">{error ? '다시 확인하기' : '인증 완료하기'}</Button>
        </form>
        <Link to="/signin" className="text-center text-label text-link underline underline-offset-4">새 로그인 메일 요청하기</Link>
        <Link to="/signup" className="text-center text-label text-ink-2 underline underline-offset-4">회원가입으로 돌아가기</Link>
      </main>
    </>
  );
}
