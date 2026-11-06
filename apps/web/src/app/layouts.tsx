import { Outlet } from 'react-router-dom';
import { DemoBanner } from '@/components/DemoBanner';
import { DEMO_MODE } from '@/lib/api';

/**
 * 학생·검표 화면: 폰 화면 하나를 영역으로 잡고 그 안에서만 보인다 (DESIGN.md 4.1).
 * - 폰 폭(480px 이하)에서는 화면 전체, 그보다 넓으면 가운데 폰 비율 영역 + 바깥 옅은 회색
 * - 스크롤은 영역 안에서만. 내용이 다 들어오면 스크롤이 생기지 않는다
 * - transform으로 영역이 fixed 요소(하단 시트, 메뉴)의 기준이 되어 영역 밖으로 나가지 않는다
 */
export function MobileLayout() {
  // 데모 모드(lib/demo.ts)에서만 위에 띠를 붙인다. 실제 서비스 화면은 아래 그대로다
  if (DEMO_MODE) return <DemoMobileLayout />;
  return (
    // 바깥을 실제 보이는 화면(fixed inset-0)에 맞춘다. 100dvh는 브라우저에 따라 보이는 높이보다 커져 하단 버튼이 잘린다
    <div className="fixed inset-0 bg-surface-2">
      <div className="phone-frame mx-auto h-full w-full max-w-app overflow-hidden bg-bg [transform:translateZ(0)]">
        <div className="h-full overflow-y-auto overscroll-contain">
          <div className="flex min-h-full flex-col">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoMobileLayout() {
  return (
    <div className="fixed inset-0 bg-surface-2">
      <div className="phone-frame mx-auto flex h-full w-full max-w-app flex-col overflow-hidden bg-bg [transform:translateZ(0)]">
        <DemoBanner />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-full flex-col">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
