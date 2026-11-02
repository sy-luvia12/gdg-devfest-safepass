import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Settings,
  Sheet,
  Smartphone,
  Ticket,
  UserCheck,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/Button';
import { cx } from '@/components/cx';
import { getEvent, listDeviceResets, listPendingVerifications } from '@/lib/api';
import type { Event } from '@/types';
import { useAuth, useEventId } from './AuthProvider';

type NavItem = { to: string; label: string; icon: LucideIcon; badge?: 'approvals' | 'devices' };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: '운영',
    items: [
      { to: '/admin', label: '실시간 현황', icon: LayoutDashboard },
      { to: '/admin/entries', label: '입장 기록', icon: ClipboardList },
      { to: '/admin/tickets', label: '발급 현황', icon: Ticket },
      { to: '/admin/transfers', label: '양도 기록', icon: ArrowLeftRight },
    ],
  },
  {
    group: '사람',
    items: [
      { to: '/admin/approvals', label: '재학생 승인', icon: UserCheck, badge: 'approvals' },
      { to: '/admin/devices', label: '기기 초기화', icon: Smartphone, badge: 'devices' },
      { to: '/admin/staff', label: '스태프 관리', icon: Users },
      { to: '/admin/roster', label: '명단 연동', icon: Sheet },
    ],
  },
  { group: '설정', items: [{ to: '/admin/settings', label: '행사 설정', icon: Settings }] },
];

export type AdminContext = {
  event: Event | null;
  setEvent: (e: Event) => void;
  /** 승인·초기화 처리 후 메뉴 배지 숫자를 다시 센다 */
  refreshBadges: () => void;
};

export function useAdmin(): AdminContext {
  return useOutletContext<AdminContext>();
}

/** 관리자 화면 공통 틀: 상단 바 + 메뉴 (노트북: 왼쪽 세로 / 폰: 위쪽 가로 스크롤) */
export function AdminLayout() {
  const eventId = useEventId();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { school, signOut } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [badges, setBadges] = useState({ approvals: 0, devices: 0 });

  useEffect(() => {
    getEvent(eventId).then(setEvent).catch(() => {});
  }, [eventId]);

  const refreshBadges = useCallback(() => {
    Promise.all([listPendingVerifications(), listDeviceResets()])
      .then(([v, d]) => setBadges({ approvals: v.length, devices: d.filter((r) => r.status === 'pending').length }))
      .catch(() => {});
  }, []);
  useEffect(refreshBadges, [refreshBadges, pathname]);

  const ctx: AdminContext = { event, setEvent, refreshBadges };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-admin items-center justify-between gap-4 px-5 md:px-8">
          <div className="min-w-0">
            <p className="text-label text-ink-3">{school?.name} · SafePass 관리자</p>
            <h1 className="truncate text-heading text-ink">{event?.name ?? '행사'}</h1>
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
              variant="ghost"
              size="sm"
              icon={<LogOut size={16} strokeWidth={1.75} />}
              onClick={signOut}
              aria-label="로그아웃"
            />
          </div>
        </div>
        {/* 폰·태블릿: 가로 스크롤 메뉴 */}
        <nav aria-label="관리자 메뉴" className="flex gap-1 overflow-x-auto px-5 pb-3 [scrollbar-width:none] lg:hidden">
          {NAV.flatMap((g) => g.items).map((item) => (
            <NavItemLink key={item.to} item={item} count={item.badge ? badges[item.badge] : 0} compact />
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-admin gap-8 px-5 py-6 md:px-8 md:py-8">
        <nav aria-label="관리자 메뉴" className="sticky top-24 hidden h-fit w-52 shrink-0 flex-col gap-6 lg:flex">
          {NAV.map((g) => (
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
