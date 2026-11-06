import { useEffect, useState, type ReactNode } from 'react';
import { LayoutGrid, LogOut, School as SchoolIcon, ShieldHalf, Smartphone, SquareArrowOutUpRight, UserCog } from '@/components/icons';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cx } from '@/components/cx';
import { OpsState } from '@/components/ops/ui';
import { listSchools } from '@/lib/api';
import type { School } from '@/types';
import { useAuth } from './AuthProvider';

/** 운영진 콘솔 공통 틀 (밝은 테마). 운영진 계정이 아니면 운영진 로그인으로 보낸다 */
export function OpsLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[] | null>(null);

  useEffect(() => {
    if (!user?.operator) return;
    listSchools()
      .then(setSchools)
      .catch(() => setSchools([]));
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-ops-canvas">
        <OpsState kind="loading" />
      </div>
    );
  }
  if (!user?.operator) return <Navigate to="/ops/login" replace />;

  const item = (to: string, label: string, icon: ReactNode, end = false) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-label transition duration-150',
          isActive ? 'bg-ops-raised text-ops-ink' : 'text-ops-ink-2 hover:text-ops-ink',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );

  return (
    <div className="page-canvas bg-ops-canvas text-ops-ink">
      {/* 상단 바는 아래 내용 영역(메뉴~본문) 폭에만 둔다 (AdminLayout과 같다) */}
      <header className="navigation-surface border-ops-line bg-ops-panel/95 sticky top-4 z-20 mx-auto mt-5 w-[calc(100%-2.5rem)] max-w-[calc(theme(maxWidth.admin)-5rem)] rounded-[32px]">
        <div className="flex h-14 items-center justify-between gap-3 px-5 md:px-8">
          <div className="flex items-center gap-2">
            <ShieldHalf size={18} strokeWidth={1.75} className="text-ops-accent" />
            <span className="text-heading text-ops-ink">Campass 운영진</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-label text-ops-ink-2 hover:text-ops-ink"
            >
              <SquareArrowOutUpRight size={15} strokeWidth={1.75} />
              <span className="hidden md:inline">행사 관리 화면</span>
            </button>
            <button
              type="button"
              aria-label="로그아웃"
              onClick={async () => {
                await signOut();
                navigate('/ops/login', { replace: true });
              }}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-label text-ops-ink-2 hover:text-ops-ink"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      <div className="page-content mx-auto flex max-w-admin flex-col gap-8 px-6 py-8 md:flex-row md:px-10 md:py-10">
        <nav className="flex gap-1 overflow-x-auto md:w-52 md:shrink-0 md:flex-col md:overflow-visible">
          {item('/ops', '개요', <LayoutGrid size={16} strokeWidth={1.75} />, true)}
          <p className="hidden px-3 pb-1 pt-4 text-caption text-ops-ink-3 md:block">학교 명단</p>
          {(schools ?? []).map((s) =>
            item(`/ops/schools/${s.id}`, s.name, <SchoolIcon size={16} strokeWidth={1.75} />),
          )}
          <p className="hidden px-3 pb-1 pt-4 text-caption text-ops-ink-3 md:block">계정</p>
          {item('/ops/admins', '행사 관리자 지정', <UserCog size={16} strokeWidth={1.75} />)}
          {item('/ops/devices', '기기 초기화', <Smartphone size={16} strokeWidth={1.75} />)}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
