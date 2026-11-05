import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MePage } from '@/pages/common/MePage';
import { DevicePage } from '@/pages/student/DevicePage';
import { EventPage } from '@/pages/student/EventPage';
import { EventsPage } from '@/pages/student/EventsPage';
import { HistoryPage } from '@/pages/student/HistoryPage';
import { RegistrationPage } from '@/pages/student/RegistrationPage';
import { SignInPage } from '@/pages/student/SignInPage';
import { AuthFinishPage } from '@/pages/student/AuthFinishPage';
import { LoginPage } from '@/pages/student/LoginPage';
import { OnboardingPage } from '@/pages/student/OnboardingPage';
import { PendingPage } from '@/pages/student/PendingPage';
import { TicketPage } from '@/pages/student/TicketPage';
import { AdminLayout } from './AdminLayout';
import { MobileLayout } from './layouts';
import { OpsLayout } from './OpsLayout';
import { RequireEvent } from './RequireEvent';
import { RequireRole } from './RequireRole';

/** 화면을 처음 열 때 내려받는다. 학생 첫 화면에 관리자·운영진·검표 코드가 딸려오지 않게 한다 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return async () => ({ Component: (await load())[name] as ComponentType });
}

export const router = createBrowserRouter([
  // 소개 페이지는 넓은 화면용이라 MobileLayout 밖에 둔다
  { path: '/about', lazy: page(() => import('@/pages/public/AboutPage'), 'AboutPage') },
  {
    element: <MobileLayout />,
    children: [
      { path: '/', element: <LoginPage /> },
      { path: '/signup', element: <RegistrationPage /> },
      { path: '/register', element: <Navigate to="/signup" replace /> },
      { path: '/signin', element: <SignInPage /> },
      { path: '/auth/finish', element: <AuthFinishPage /> },
      { path: '/terms', lazy: async () => { const { PolicyPage } = await import('@/pages/public/PolicyPage'); return { Component: () => <PolicyPage kind="terms" /> }; } },
      { path: '/privacy', lazy: async () => { const { PolicyPage } = await import('@/pages/public/PolicyPage'); return { Component: () => <PolicyPage kind="privacy" /> }; } },
      {
        // 학생: 승인·기기 상태에 따라 온보딩/기기 화면을 먼저 거친다. 학생회는 학생 화면도 볼 수 있다
        element: <RequireRole roles={['student', 'admin']} gate />,
        children: [
          { path: '/onboarding', element: <OnboardingPage /> },
          { path: '/onboarding/pending', element: <PendingPage /> },
          { path: '/device', element: <DevicePage /> },
          { path: '/events', element: <EventsPage /> },
          {
            // 학교에 행사가 아직 없으면 축제 목록(빈 상태)으로
            element: <RequireEvent who="student" />,
            children: [
              { path: '/event', element: <EventPage /> },
              { path: '/ticket', element: <TicketPage /> },
              { path: '/ticket/history', element: <HistoryPage /> },
              { path: '/event/board', lazy: page(() => import('@/pages/student/BoardPage'), 'BoardPage') },
              { path: '/event/draw', lazy: page(() => import('@/pages/student/DrawPage'), 'DrawPage') },
            ],
          },
        ],
      },
      {
        element: <RequireRole roles={['student', 'staff', 'admin']} />,
        children: [{ path: '/me', element: <MePage /> }],
      },
      {
        element: <RequireRole roles={['staff', 'admin']} />,
        children: [
          { element: <RequireEvent who="staff" />, children: [{ path: '/staff/scan', lazy: page(() => import('@/pages/staff/ScanPage'), 'ScanPage') }] },
          { path: '/staff/history', lazy: page(() => import('@/pages/staff/ScanHistoryPage'), 'ScanHistoryPage') },
        ],
      },
    ],
  },
  {
    // 관리자 화면은 넓은 레이아웃이라 MobileLayout 밖에 둔다
    element: <RequireRole roles={['admin']} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          // 학교 메뉴: 행사가 없어도 쓴다
          { path: '/admin/setup', lazy: page(() => import('@/pages/admin/SetupPage'), 'SetupPage') },
          { path: '/admin/students', lazy: page(() => import('@/pages/admin/StudentRosterPage'), 'StudentRosterPage') },
          { path: '/admin/events', lazy: page(() => import('@/pages/admin/EventListPage'), 'EventListPage') },
          { path: '/admin/events/new', lazy: page(() => import('@/pages/admin/EventFormPage'), 'EventFormPage') },
          { path: '/admin/devices', lazy: page(() => import('@/pages/admin/DevicesPage'), 'DevicesPage') },
          { path: '/admin/staff', lazy: page(() => import('@/pages/admin/StaffPage'), 'StaffPage') },
          {
            // 행사 메뉴: 고른 행사 기준
            element: <RequireEvent who="admin" />,
            children: [
              { path: '/admin', lazy: page(() => import('@/pages/admin/AdminPage'), 'AdminPage') },
              { path: '/admin/entries', lazy: page(() => import('@/pages/admin/EntriesPage'), 'EntriesPage') },
              { path: '/admin/tickets', lazy: page(() => import('@/pages/admin/TicketsPage'), 'TicketsPage') },
              { path: '/admin/reassignments', lazy: page(() => import('@/pages/admin/ReassignmentsPage'), 'ReassignmentsPage') },
              { path: '/admin/roster', lazy: page(() => import('@/pages/admin/RosterPage'), 'RosterPage') },
              { path: '/admin/settings', lazy: page(() => import('@/pages/admin/SettingsPage'), 'SettingsPage') },
            ],
          },
        ],
      },
    ],
  },
  // 운영진 콘솔 (검정 테마). 아이디·비밀번호로 들어오는 Campass 운영진만
  { path: '/ops/login', lazy: page(() => import('@/pages/ops/OpsLoginPage'), 'OpsLoginPage') },
  {
    element: <OpsLayout />,
    children: [
      { path: '/ops', lazy: page(() => import('@/pages/ops/OpsHomePage'), 'OpsHomePage') },
      { path: '/ops/schools/:schoolId', lazy: page(() => import('@/pages/ops/OpsSchoolPage'), 'OpsSchoolPage') },
      { path: '/ops/events/:eventId', lazy: page(() => import('@/pages/ops/OpsEventPage'), 'OpsEventPage') },
      { path: '/ops/admins', lazy: page(() => import('@/pages/ops/OpsAdminsPage'), 'OpsAdminsPage') },
      { path: '/ops/devices', lazy: page(() => import('@/pages/ops/OpsDevicesPage'), 'OpsDevicesPage') },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
