import { useState } from 'react';
import { ChevronLeft, Menu, RotateCcw, X } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { homePathFor, studentGatePath } from '@/app/config';
import { Button } from '@/components/Button';
import { cx } from '@/components/cx';
import { Orb } from '@/components/Orb';
import { StateView } from '@/components/StateView';
import { DEMO_MODE } from '@/lib/api';
import { exitDemo } from '@/lib/demo';
import { MOCK_OUTSIDER, MOCK_SCHOOL_ACCOUNTS, mockReset, mockSelectAccount, mockSelectedAccount } from '@/lib/mock';
import { ApiError, type User } from '@/types';

// mock일 때만 쓰는 데모 계정 전환 패널. 숨기려면 VITE_DEMO_PANEL=off. 데모 모드(lib/demo.ts)에서는 숨긴다
const SHOW_DEMO_PANEL = !DEMO_MODE && __USE_MOCK__ && import.meta.env.VITE_DEMO_PANEL !== 'off';

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const goHome = (u: User) => {
    if (u.role !== 'student') return navigate(homePathFor(u.role), { replace: true });
    const gate = studentGatePath(u);
    if (gate) return navigate(gate, { replace: true });
    navigate(STUDENT_HOME, { replace: true });
  };

  const onStart = async () => {
    setMenuOpen(false);
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
  // 데모 탭에서 로그인이 풀리면 데모를 끝내고 실제 메인 화면을 연다
  if (DEMO_MODE && !user) {
    exitDemo();
    return <StateView kind="loading" fullScreen />;
  }
  if (user && !submitting) {
    if (user.operator) return <Navigate to="/ops" replace />;
    return user.role === 'student' ? <StudentRedirect /> : <Navigate to={homePathFor(user.role)} replace />;
  }

  return (
    <>
      {/* 폰 영역 한 화면에 다 들어오게: 높이가 모자라면 구가 줄어든다 */}
      <main className="flex min-h-[560px] flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
        <div className="flex items-center justify-between">
          <Link
            to="/about"
            className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-2 text-caption text-ink-2 hover:bg-surface-2"
          >
            <ChevronLeft size={14} strokeWidth={2} />
            Campass 소개 보러가기
          </Link>
          <button
            type="button"
            aria-label="메뉴"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-2 hover:bg-surface-2"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
        </div>
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(16px,4dvh,40px)] py-4 text-center">
          <Orb size="min(200px, 22dvh)" />
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
        </section>
      </main>
        {menuOpen && <LoginMenu onClose={() => setMenuOpen(false)} onAdminLogin={onStart} />}
    </>
  );
}

/** 오른쪽 위 메뉴. 관리자(학생회·스태프, 구글)와 운영진(아이디·비밀번호) 로그인은 여기에만 둔다 */
function LoginMenu({ onClose, onAdminLogin }: { onClose: () => void; onAdminLogin: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 animate-fade-in" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="메뉴"
        className="fixed right-0 top-0 z-40 flex h-full w-64 flex-col gap-2 bg-bg p-5 shadow-float"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-label text-ink-3">메뉴</span>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-2"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <button
          type="button"
          onClick={onAdminLogin}
          className="rounded-lg bg-surface px-4 py-4 text-label text-ink hover:bg-surface-2"
        >
          관리자 로그인
        </button>
        <Link to="/ops/login" className="rounded-lg bg-surface px-4 py-4 text-center text-label text-ink hover:bg-surface-2">
          운영진 로그인
        </Link>
      </aside>
    </>
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
