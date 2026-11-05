import { useState } from 'react';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { homePathFor, studentGatePath } from '@/app/config';
import { Button } from '@/components/Button';
import { cx } from '@/components/cx';
import { Orb } from '@/components/Orb';
import { StateView } from '@/components/StateView';
import { MOCK_OUTSIDER, MOCK_SCHOOL_ACCOUNTS, mockReset, mockSelectAccount, mockSelectedAccount } from '@/lib/mock';
import { ApiError, type User } from '@/types';

// mock일 때만 쓰는 데모 계정 전환 패널. 숨기려면 VITE_DEMO_PANEL=off
const SHOW_DEMO_PANEL = __USE_MOCK__ && import.meta.env.VITE_DEMO_PANEL !== 'off';

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = (u: User) => {
    if (u.role !== 'student') return navigate(homePathFor(u.role), { replace: true });
    const gate = studentGatePath(u);
    if (gate) return navigate(gate, { replace: true });
    navigate(STUDENT_HOME, { replace: true });
  };

  const onStart = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { user: u } = await signIn();
      goHome(u);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'not_school_account'
          ? '학교 계정으로만 이용할 수 있어요'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <StateView kind="loading" fullScreen />;
  if (user && !submitting) {
    if (user.operator) return <Navigate to="/ops" replace />;
    return user.role === 'student' ? <StudentRedirect /> : <Navigate to={homePathFor(user.role)} replace />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4">
      <div className="flex">
        <Link
          to="/about"
          className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-2 text-caption text-ink-2 hover:bg-surface-2"
        >
          <ChevronLeft size={14} strokeWidth={2} />
          Campass 소개 보러가기
        </Link>
      </div>
      <section className="flex flex-1 flex-col items-center justify-center gap-10 py-10 text-center">
        <Orb size={200} />
        <div className="flex flex-col gap-2">
          <h1 className="text-display text-ink">Campass</h1>
          <p className="text-body text-ink-2">재학생만을 위한 축제 입장권</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-md bg-danger-bg px-4 py-3 text-center text-label text-danger">
            {error}
          </p>
        )}
        <Button onClick={() => navigate('/signin')}>로그인</Button>
        <p className="text-center text-label text-ink-2">
          아직 계정이 없으신가요?{' '}
          <Link to="/signup" className="text-ink underline underline-offset-4">회원가입 하러가기</Link>
        </p>
        <Button variant="ghost" loading={submitting} onClick={onStart}>운영진 로그인 (Google)</Button>
        <p className="text-center text-caption text-ink-3">
          시작하면{' '}
          <Link to="/terms" className="text-link">
            이용약관
          </Link>
          과{' '}
          <Link to="/privacy" className="text-link">
            개인정보 처리방침
          </Link>
          에 동의하게 돼요
        </p>
        {SHOW_DEMO_PANEL && <>
          <DemoPanel />
          <Button variant="secondary" loading={submitting} onClick={onStart}>선택한 데모 계정으로 바로 로그인</Button>
        </>}
        <Link to="/ops/login" className="self-center text-caption text-ink-3">
          운영진
        </Link>
      </section>
    </main>
  );
}

/** 학생은 들어오면 항상 축제 목록부터 본다. 입장권이 있어도 목록에서 고른다 */
const STUDENT_HOME = '/events';

/** 이미 로그인한 학생 */
function StudentRedirect() {
  const { user } = useAuth();
  const gate = user ? studentGatePath(user) : null;
  return <Navigate to={gate ?? STUDENT_HOME} replace />;
}

function DemoPanel() {
  const [selected, setSelected] = useState(mockSelectedAccount);
  const [open, setOpen] = useState(false);
  const all = MOCK_SCHOOL_ACCOUNTS.flatMap((g) => g.accounts.map((a) => ({ ...a, school: g.school })));
  const current = all.find((a) => a.uid === selected);

  const select = (uid: string) => {
    mockSelectAccount(uid);
    setSelected(uid);
  };

  return (
    <div className="mt-2 rounded-lg border border-line p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-label text-ink-2"
      >
        <span>데모 계정</span>
        <span className="flex min-w-0 items-center gap-2 text-ink">
          {current && <SchoolDot color={current.school.brandColor} />}
          <span className="truncate">
            {current ? `${current.school.name} · ${current.label}` : MOCK_OUTSIDER.label}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-4 text-left">
          {MOCK_SCHOOL_ACCOUNTS.map(({ school, accounts }) => (
            <div key={school.id} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-caption text-ink-2">
                <SchoolDot color={school.brandColor} />
                {school.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <AccountChip key={a.uid} label={a.label} active={selected === a.uid} onClick={() => select(a.uid)} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <AccountChip
              label={MOCK_OUTSIDER.label}
              active={selected === MOCK_OUTSIDER.uid}
              onClick={() => select(MOCK_OUTSIDER.uid)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm('데모 데이터를 처음 상태로 되돌릴까요?')) mockReset();
            }}
            className="flex items-center gap-1 self-start text-caption text-ink-3"
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            데모 데이터 초기화
          </button>
        </div>
      )}
    </div>
  );
}

function SchoolDot({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />;
}

function AccountChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-8 rounded-full px-3 text-label transition duration-200',
        active ? 'bg-lavender text-ink' : 'bg-surface text-ink-2',
      )}
    >
      {label}
    </button>
  );
}
