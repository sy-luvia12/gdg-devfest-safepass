import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminPage } from '@/pages/admin/AdminPage';
import { ApprovalsPage } from '@/pages/admin/ApprovalsPage';
import { ReassignmentsPage } from '@/pages/admin/ReassignmentsPage';
import { DevicesPage } from '@/pages/admin/DevicesPage';
import { EntriesPage } from '@/pages/admin/EntriesPage';
import { RosterPage } from '@/pages/admin/RosterPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { StaffPage } from '@/pages/admin/StaffPage';
import { TicketsPage } from '@/pages/admin/TicketsPage';
import { MePage } from '@/pages/common/MePage';
import { AboutPage } from '@/pages/public/AboutPage';
import { PolicyPage } from '@/pages/public/PolicyPage';
import { ScanHistoryPage } from '@/pages/staff/ScanHistoryPage';
import { ScanPage } from '@/pages/staff/ScanPage';
import { DevicePage } from '@/pages/student/DevicePage';
import { EventPage } from '@/pages/student/EventPage';
import { HistoryPage } from '@/pages/student/HistoryPage';
import { LoginPage } from '@/pages/student/LoginPage';
import { OnboardingPage } from '@/pages/student/OnboardingPage';
import { PendingPage } from '@/pages/student/PendingPage';
import { TicketPage } from '@/pages/student/TicketPage';
import { AdminLayout } from './AdminLayout';
import { MobileLayout } from './layouts';
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
          { path: '/event', element: <EventPage /> },
          { path: '/ticket', element: <TicketPage /> },
          { path: '/ticket/history', element: <HistoryPage /> },
        ],
      },
      {
        element: <RequireRole roles={['student', 'staff', 'admin']} />,
        children: [{ path: '/me', element: <MePage /> }],
      },
      {
        element: <RequireRole roles={['staff', 'admin']} />,
        children: [
          { path: '/staff/scan', element: <ScanPage /> },
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
          { path: '/admin', element: <AdminPage /> },
          { path: '/admin/entries', element: <EntriesPage /> },
          { path: '/admin/tickets', element: <TicketsPage /> },
          { path: '/admin/reassignments', element: <ReassignmentsPage /> },
          { path: '/admin/approvals', element: <ApprovalsPage /> },
          { path: '/admin/devices', element: <DevicesPage /> },
          { path: '/admin/staff', element: <StaffPage /> },
          { path: '/admin/roster', element: <RosterPage /> },
          { path: '/admin/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
