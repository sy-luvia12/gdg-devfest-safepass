import { useState, type FormEvent } from 'react';
import { ShieldHalf } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { OpsButton, OpsInput, OpsNotice, OpsState } from '@/components/ops/ui';
import { ApiError } from '@/types';

/** 운영진 로그인: 정해진 아이디·비밀번호 (메일 링크 없음) */
export function OpsLoginPage() {
  const { user, loading, signInOperator } = useAuth();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInOperator(id, password);
      navigate('/ops', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      setError(
        code === 'wrong_password'
          ? '아이디나 비밀번호가 달라요'
          : code === 'too_many_attempts'
            ? '여러 번 틀려서 잠시 막혔어요. 조금 뒤에 다시 시도해 주세요'
            : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-ops-bg">
        <OpsState kind="loading" />
      </div>
    );
  }
  if (user?.operator && !submitting) return <Navigate to="/ops" replace />;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ops-bg px-5">
      <form onSubmit={onSubmit} className="flex w-full max-w-[360px] flex-col gap-4">
        <div className="mb-4 flex flex-col items-center gap-3 text-center">
          <ShieldHalf size={36} strokeWidth={1.5} className="text-ops-accent" />
          <h1 className="text-title text-ops-ink">SafePass 운영진</h1>
          <p className="text-label text-ops-ink-2">모든 학교의 명단과 기기를 관리해요</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-ops-ink-2">아이디</span>
          <OpsInput value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="none" className="h-11" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-ops-ink-2">비밀번호</span>
          <OpsInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="h-11"
          />
        </label>
        {error && <OpsNotice tone="bad">{error}</OpsNotice>}
        <OpsButton type="submit" variant="primary" size="md" loading={submitting} disabled={!id || !password} className="mt-2 w-full">
          들어가기
        </OpsButton>
        <Link to="/" className="text-center text-caption text-ops-ink-3 underline underline-offset-4">
          일반 로그인으로
        </Link>
      </form>
    </main>
  );
}
