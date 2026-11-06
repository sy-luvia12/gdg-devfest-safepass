import type { ReactNode } from 'react';

/** 관리자 메뉴 화면 상단 제목 + 설명 + 우측 동작 */
export function PageTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-title text-ink">{title}</h2>
        {description && <p className="mt-1 text-body text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}
