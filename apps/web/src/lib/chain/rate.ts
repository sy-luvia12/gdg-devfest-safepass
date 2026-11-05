// Kept apart from entry.ts so screens can format a win rate without pulling viem into the first bundle.

/** 1/10000 → "25%" or "0.3%" */
export const formatRate = (bps: number): string => {
  const pct = bps / 100;
  return `${pct >= 10 || Number.isInteger(pct) ? Math.round(pct) : pct.toFixed(1)}%`;
};

/** 당첨 확률 (1/10000) = 정원 ÷ 재학생 수. 재학생 수를 모르거나 정원보다 적으면 100%. 서버 winBpsOf와 같은 규칙 */
export const drawRateOf = (capacity: number, pool: number | undefined): number => {
  if (!(capacity > 0)) return 0;
  if (!pool || !(pool > capacity)) return 10_000;
  return Math.max(1, Math.floor((capacity * 10_000) / pool));
};
