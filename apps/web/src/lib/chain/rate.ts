// Kept apart from entry.ts so screens can format a win rate without pulling viem into the first bundle.

/** 1/10000 → "25%" or "0.3%" */
export const formatRate = (bps: number): string => {
  const pct = bps / 100;
  return `${pct >= 10 || Number.isInteger(pct) ? Math.round(pct) : pct.toFixed(1)}%`;
};
