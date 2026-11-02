import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { StateView } from '@/components/StateView';
import type { Role } from '@/types';
import { useAuth } from './AuthProvider';
import { homePathFor, studentGatePath } from './config';

type Props = {
  roles: Role[];
  /** 학생 승인·기기 상태에 따라 온보딩/기기 화면으로 먼저 보낸다 */
  gate?: boolean;
};

/** 로그인 + 역할 확인. 권한이 없으면 역할별 첫 화면으로 보낸다. */
export function RequireRole({ roles, gate }: Props) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <StateView kind="loading" fullScreen />;
  if (!user) return <Navigate to="/" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  const blocked = gate ? studentGatePath(user) : null;
  if (blocked && blocked !== pathname) return <Navigate to={blocked} replace />;
  return <Outlet />;
}
