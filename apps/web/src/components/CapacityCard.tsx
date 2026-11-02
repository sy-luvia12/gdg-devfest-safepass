type Props = { entered: number; capacity: number };

/** 관리자 화면의 그라데이션 포인트 (DESIGN.md 5장) */
export function CapacityCard({ entered, capacity }: Props) {
  const ratio = capacity > 0 ? entered / capacity : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  return (
    <section className="relative overflow-hidden rounded-xl p-6 lg:p-8">
      <div className="absolute inset-0 bg-grad-ticket opacity-50" />
      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-label text-ink-2">현재 입장 인원</h2>
        </div>
        <p className="flex items-baseline gap-1">
          <span key={entered} className="inline-block text-number tabular text-ink animate-rise-in lg:text-number-lg">
            {entered.toLocaleString('ko-KR')}
          </span>
          <span className="text-heading text-ink-2 tabular">/ {capacity.toLocaleString('ko-KR')}명</span>
        </p>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
            <div className="h-full rounded-full bg-ink transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-label">
            <span className="text-ink-2">정원 대비</span>
            <span className="text-ink tabular">{pct}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
