import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminPage } from '@/pages/admin/AdminPage';
import { ReassignmentsPage } from '@/pages/admin/ReassignmentsPage';
import { DevicesPage } from '@/pages/admin/DevicesPage';
import { EntriesPage } from '@/pages/admin/EntriesPage';
import { EventFormPage } from '@/pages/admin/EventFormPage';
import { EventListPage } from '@/pages/admin/EventListPage';
import { RosterPage } from '@/pages/admin/RosterPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { SetupPage } from '@/pages/admin/SetupPage';
import { StaffPage } from '@/pages/admin/StaffPage';
import { StudentRosterPage } from '@/pages/admin/StudentRosterPage';
import { TicketsPage } from '@/pages/admin/TicketsPage';
import { MePage } from '@/pages/common/MePage';
import { OpsDevicesPage } from '@/pages/ops/OpsDevicesPage';
import { OpsEventPage } from '@/pages/ops/OpsEventPage';
import { OpsHomePage } from '@/pages/ops/OpsHomePage';
import { OpsLoginPage } from '@/pages/ops/OpsLoginPage';
import { OpsSchoolPage } from '@/pages/ops/OpsSchoolPage';
import { AboutPage } from '@/pages/public/AboutPage';
import { PolicyPage } from '@/pages/public/PolicyPage';
import { ScanHistoryPage } from '@/pages/staff/ScanHistoryPage';
import { ScanPage } from '@/pages/staff/ScanPage';
import { DevicePage } from '@/pages/student/DevicePage';
import { EventPage } from '@/pages/student/EventPage';
import { EventsPage } from '@/pages/student/EventsPage';
import { HistoryPage } from '@/pages/student/HistoryPage';
import { LoginPage } from '@/pages/student/LoginPage';
import { OnboardingPage } from '@/pages/student/OnboardingPage';
import { PendingPage } from '@/pages/student/PendingPage';
import { TicketPage } from '@/pages/student/TicketPage';
import { AdminLayout } from './AdminLayout';
import { MobileLayout } from './layouts';
import { OpsLayout } from './OpsLayout';
import { RequireEvent } from './RequireEvent';
import { RequireRole } from './RequireRole';

export const router = createBrowserRouter([
  // 소개 페이지는 넓은 화면용이라 MobileLayout 밖에 둔다
  { path: '/about', element: <AboutPage /> },
  {
    element: <MobileLayout />,
    children: [
      { path: '/', element: <LoginPage /> },
      { path: '/terms', element: <PolicyPage kind="terms" /> },
      { path: '/privacy', element: <PolicyPage kind="privacy" /> },
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
          { element: <RequireEvent who="staff" />, children: [{ path: '/staff/scan', element: <ScanPage /> }] },
          { path: '/staff/history', element: <ScanHistoryPage /> },
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
          { path: '/admin/setup', element: <SetupPage /> },
          { path: '/admin/students', element: <StudentRosterPage /> },
          { path: '/admin/events', element: <EventListPage /> },
          { path: '/admin/events/new', element: <EventFormPage /> },
          { path: '/admin/devices', element: <DevicesPage /> },
          { path: '/admin/staff', element: <StaffPage /> },
          {
            // 행사 메뉴: 고른 행사 기준
            element: <RequireEvent who="admin" />,
            children: [
              { path: '/admin', element: <AdminPage /> },
              { path: '/admin/entries', element: <EntriesPage /> },
              { path: '/admin/tickets', element: <TicketsPage /> },
              { path: '/admin/reassignments', element: <ReassignmentsPage /> },
              { path: '/admin/roster', element: <RosterPage /> },
              { path: '/admin/settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  // 운영진 콘솔 (검정 테마). 아이디·비밀번호로 들어오는 SafePass 운영진만
  { path: '/ops/login', element: <OpsLoginPage /> },
  {
    element: <OpsLayout />,
    children: [
      { path: '/ops', element: <OpsHomePage /> },
      { path: '/ops/schools/:schoolId', element: <OpsSchoolPage /> },
      { path: '/ops/events/:eventId', element: <OpsEventPage /> },
      { path: '/ops/devices', element: <OpsDevicesPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
