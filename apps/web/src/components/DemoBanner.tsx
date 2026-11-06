import { LogOut } from 'lucide-react';
import { DEMO_MODE } from '@/lib/api';
import { exitDemo } from '@/lib/demo';

/** 데모 모드(lib/demo.ts)에서만 화면 맨 위에 보이는 띠. 실제 서비스와 헷갈리지 않게 하고, 나가기를 둔다 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 bg-lavender px-4 py-2 text-caption text-ink">
      <span className="min-w-0 truncate">데모 모드 · 가짜 데이터라 이 브라우저에만 남아요</span>
      <button
        type="button"
        onClick={() => {
          if (confirm('데모를 끝낼까요? 데모에서 한 일은 지워져요')) exitDemo();
        }}
        className="flex shrink-0 items-center gap-1 rounded-full bg-bg px-3 py-1 text-ink-2 hover:text-ink"
      >
        <LogOut size={14} strokeWidth={1.75} />
        나가기
      </button>
    </div>
  );
}
