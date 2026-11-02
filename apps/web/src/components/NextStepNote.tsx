import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

/** 프로토타입에서 실제 연동 전인 기능 안내 (발표에서 "다음 단계" 설명용) */
export function NextStepNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-surface px-4 py-3 text-caption text-ink-2">
      <Info size={16} strokeWidth={1.75} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
