import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ClipboardList,
  Dices,
  GraduationCap,
  ListOrdered,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Settings,
  Sheet,
  Smartphone,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/Button';
import { cx } from '@/components/cx';
import { eventTitle } from '@/app/format';
import { SchoolSwitcher } from '@/components/SchoolSwitcher';
import { StateView } from '@/components/StateView';
import { getEvent, listDeviceResets } from '@/lib/api';
import type { Event } from '@/types';
import { useAuth } from './AuthProvider';
import { isUnassignedAdmin } from './config';

/** teamOnly: 학교 담당자 일이라 운영진에게만 보인다. 행사 담당자에게는 숨긴다 */
type NavItem = { to: string; label: string; icon: LucideIcon; badge?: 'devices'; teamOnly?: boolean };

// 학교 메뉴는 행사를 바꿔도 그대로, 행사 메뉴는 지금 고른 행사 기준
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: '이 행사',
    items: [
      { to: '/admin', label: '실시간 현황', icon: LayoutDashboard },
      { to: '/admin/entries', label: '입장 기록', icon: ClipboardList },
      { to: '/admin/tickets', label: '발급 현황', icon: Ticket },
      { to: '/admin/reassignments', label: '취소·재배정', icon: ListOrdered },
      { to: '/admin/roster', label: '행사 명단', icon: Sheet },
      { to: '/admin/settings', label: '행사 설정', icon: Settings },
    ],
  },
  {
    group: '학교',
    items: [
      { to: '/admin/events', label: '행사 목록', icon: CalendarDays },
      { to: '/admin/students', label: '재학생 명단', icon: GraduationCap, teamOnly: true },
      { to: '/admin/devices', label: '기기 초기화', icon: Smartphone, badge: 'devices', teamOnly: true },
      { to: '/admin/staff', label: '스태프 관리', icon: Users },
    ],
  },
];

const TEAM_ONLY_PATHS = ['/admin/students', '/admin/devices', '/admin/setup'];

export type AdminContext = {
  event: Event | null;
  setEvent: (e: Event) => void;
  /** 기기 초기화 처리 후 메뉴 배지 숫자를 다시 센다 */
  refreshBadges: () => void;
};

export function useAdmin(): AdminContext {
  return useOutletContext<AdminContext>();
}

/** 관리자 화면 공통 틀: 상단 바 + 메뉴 (노트북: 왼쪽 세로 / 폰: 위쪽 가로 스크롤) */
export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, school, eventId, signOut } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [badges, setBadges] = useState({ devices: 0 });
  // 행사 담당자: 자기 학교 행사만, 학교 담당자 메뉴(재학생 명단·기기 초기화·스페이스)는 운영진만
  const operator = !!user?.operator;
  const eventAdmin = !operator;
  // 추첨 행사는 행사 명단 대신 추첨 결과를 본다 (같은 주소)
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => operator || !i.teamOnly)
      .map((i) => (i.to === '/admin/roster' && event?.instantDraw ? { ...i, label: '추첨 결과', icon: Dices } : i)),
  }));

  useEffect(() => {
    // 학교를 바꾸면 이전 행사 이름이 남지 않게 비운다
    setEvent(null);
    if (!eventId) return;
    let cancelled = false;
    getEvent(eventId)
      .then((e) => !cancelled && setEvent(e))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const refreshBadges = useCallback(() => {
    if (eventAdmin) return;
    listDeviceResets()
      .then((d) => setBadges({ devices: d.filter((r) => r.status === 'pending').length }))
      .catch(() => {});
  }, [eventAdmin]);
  useEffect(refreshBadges, [refreshBadges, pathname]);

  const ctx: AdminContext = { event, setEvent, refreshBadges };
  const inSetup = pathname === '/admin/setup';
  // 학교가 지정되지 않은 관리자: 운영진이 학교를 지정할 때까지 기다린다
  if (user && isUnassignedAdmin(user)) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-5">
        <StateView
          kind="empty"
          title="아직 맡은 학교가 없어요"
          description="운영진이 이 계정을 학교 행사 담당자로 지정하면 행사 관리 화면을 쓸 수 있어요"
          action={
            <Button variant="secondary" onClick={signOut}>
              로그아웃
            </Button>
          }
        />
      </div>
    );
  }
  // 학교 담당자 화면에 직접 들어온 행사 담당자는 실시간 현황으로
  if (eventAdmin && TEAM_ONLY_PATHS.includes(pathname)) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-admin items-center justify-between gap-4 px-5 md:px-8">
          <div className="min-w-0">
            <p className="text-label text-ink-3">{school?.name ?? '새 스페이스'} · Campass 관리자</p>
            <h1 className="truncate text-heading text-ink">
              {inSetup ? '스페이스 만들기' : event ? eventTitle(event) : eventId ? '' : '행사 없음'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ScanLine size={16} strokeWidth={1.75} />}
              onClick={() => navigate('/staff/scan')}
            >
              <span className="hidden md:inline">검표 화면</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<UserRound size={16} strokeWidth={1.75} />}
              onClick={() => navigate('/ticket')}
            >
              <span className="hidden md:inline">학생 화면</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut size={16} strokeWidth={1.75} />}
              onClick={signOut}
              aria-label="로그아웃"
            />
          </div>
        </div>
        {/* 학교·행사 고르기 (고를 것이 있을 때만) */}
        <SchoolSwitcher className="mx-auto max-w-admin px-5 pb-3 md:px-8" />
        {/* 폰·태블릿: 가로 스크롤 메뉴 (스페이스 만드는 중에는 숨김) */}
        <nav
          aria-label="관리자 메뉴"
          className={cx('gap-1 overflow-x-auto px-5 pb-3 [scrollbar-width:none] lg:hidden', inSetup ? 'hidden' : 'flex')}
        >
          {nav.flatMap((g) => g.items).map((item) => (
            <NavItemLink key={item.to} item={item} count={item.badge ? badges[item.badge] : 0} compact />
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-admin gap-8 px-5 py-6 md:px-8 md:py-8">
        <nav
          aria-label="관리자 메뉴"
          className={cx('sticky top-24 hidden h-fit w-52 shrink-0 flex-col gap-6', !inSetup && 'lg:flex')}
        >
          {nav.map((g) => (
            <div key={g.group} className="flex flex-col gap-1">
              <p className="px-3 pb-1 text-caption text-ink-3">{g.group}</p>
              {g.items.map((item) => (
                <NavItemLink key={item.to} item={item} count={item.badge ? badges[item.badge] : 0} />
              ))}
            </div>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}

function NavItemLink({ item, count, compact }: { item: NavItem; count: number; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      className={({ isActive }) =>
        cx(
          'flex shrink-0 items-center gap-2 rounded-full text-label transition duration-200',
          compact ? 'h-9 px-3' : 'h-10 px-3',
          isActive ? 'bg-lavender text-ink' : 'text-ink-2 hover:bg-surface',
        )
      }
    >
      <Icon size={compact ? 16 : 18} strokeWidth={1.75} />
      <span className="whitespace-nowrap">{item.label}</span>
      {count > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white tabular">
          {count}
        </span>
      )}
    </NavLink>
  );
}
