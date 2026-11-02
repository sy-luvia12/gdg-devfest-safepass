import { Outlet } from 'react-router-dom';

/** 학생·검표 화면: 폰은 전체 폭, md 이상은 480px 가운데 정렬 (DESIGN.md 4.1) */
export function MobileLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col">
      <Outlet />
    </div>
  );
}
