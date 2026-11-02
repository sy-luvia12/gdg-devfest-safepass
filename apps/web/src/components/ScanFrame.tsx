import type { ReactNode } from 'react';

/** 카메라 영역 + 네 모서리 흰 꺾쇠 (DESIGN.md 5장) */
export function ScanFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-grad-ticket">
      <div className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover">{children}</div>
      <div className="pointer-events-none absolute inset-6">
        <Corner className="left-0 top-0 rounded-tl-[6px] border-l-[3px] border-t-[3px]" />
        <Corner className="right-0 top-0 rounded-tr-[6px] border-r-[3px] border-t-[3px]" />
        <Corner className="bottom-0 left-0 rounded-bl-[6px] border-b-[3px] border-l-[3px]" />
        <Corner className="bottom-0 right-0 rounded-br-[6px] border-b-[3px] border-r-[3px]" />
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute h-7 w-7 border-white ${className}`} />;
}
