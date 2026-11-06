import { CalendarPlus } from '@/components/icons';
import { Navigate, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/Button';
import { StateView } from '@/components/StateView';
import { useAuth } from './AuthProvider';

/** 고른 행사가 있어야 하는 화면 앞에 둔다. 학교에 행사가 아직 없으면 화면 대신 안내를 보여준다 */
export function RequireEvent({ who }: { who: 'student' | 'staff' | 'admin' }) {
  const { eventId } = useAuth();
  const navigate = useNavigate();
  // 관리자 화면은 AdminLayout의 context(useAdmin)를 안쪽 화면까지 넘겨야 한다
  const context = useOutletContext();
  if (eventId) return <Outlet context={context} />;
  // 학생은 축제 목록의 빈 상태("아직 열린 축제가 없어요")로 간다
  if (who === 'student') return <Navigate to="/events" replace />;
  if (who === 'staff') {
    return <StateView kind="empty" fullScreen title="검표할 행사가 없어요" description="학생회가 행사를 등록하면 검표할 수 있어요" />;
  }
  return (
    <StateView
      kind="empty"
      title="행사를 먼저 등록해 주세요"
      description="행사를 등록하면 현황·발급·명단을 행사별로 관리할 수 있어요"
      action={
        <Button size="sm" icon={<CalendarPlus size={16} strokeWidth={1.75} />} onClick={() => navigate('/admin/events/new')}>
          행사 등록
        </Button>
      }
    />
  );
}
