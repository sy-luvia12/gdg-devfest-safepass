import type { LotteryPhase, LotterySettings } from '../api';

// Schedule rules for the cancelled-ticket lottery (docs/api.md 14장). Pure: every function takes "now".
// Times are Asia/Seoul wall clock. Seoul has no daylight saving time, so a fixed +9 h offset is exact.

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;
const SEOUL_OFFSET = 9 * HOUR;
export const COMMIT_LEAD_MS = 10 * MINUTE; // commitDraw goes on chain this long before the announcement
const EARLIEST_ANNOUNCE = 6 * 60; // 06:00, minutes after midnight
const LATEST_ANNOUNCE = 21 * 60; // 21:00
const NIGHT_STARTS = 22 * 60; // a claim window must close by 22:00

export const DEFAULT_LOTTERY: LotterySettings = {
  announceTimes: ['12:00'],
  minDrawGapHours: 12,
  finalPhase: { startsBeforeHours: 72, announceTimes: ['10:00', '19:00'], minDrawGapHours: 6 },
  claimWindowMinutes: 60,
  drawCloseBeforeStartHours: 3,
};

const minutesOf = (hhmm: string): number => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new RangeError(`${hhmm} is not HH:MM.`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Problems with a settings object, in Korean for the admin screen. Empty means valid. */
export function lotterySettingsProblems(s: LotterySettings): string[] {
  const problems: string[] = [];
  const phase = (name: string, p: LotteryPhase) => {
    let times: number[];
    try {
      times = p.announceTimes.map(minutesOf).sort((a, b) => a - b);
    } catch {
      problems.push(`${name}: 발표 시각은 HH:MM이어야 합니다`);
      return;
    }
    if (times.length === 0) problems.push(`${name}: 발표 시각이 하나 이상 있어야 합니다`);
    if (!(p.minDrawGapHours > 0)) problems.push(`${name}: 최소 추첨 간격은 0보다 커야 합니다`);
    for (const t of times) {
      if (t < EARLIEST_ANNOUNCE || t > LATEST_ANNOUNCE) problems.push(`${name}: 발표는 06:00~21:00 사이만 됩니다`);
      if (t + s.claimWindowMinutes > NIGHT_STARTS) problems.push(`${name}: 수락 마감이 22:00을 넘습니다`);
    }
    // Gaps between neighbouring announcements, the last of a day to the first of the next included.
    const need = (p.minDrawGapHours + 1) * 60;
    for (let i = 0; i < times.length; i++) {
      const gap = i + 1 < times.length ? times[i + 1] - times[i] : times[0] + 24 * 60 - times[i];
      if (gap < need) problems.push(`${name}: 발표 간격은 최소 추첨 간격보다 1시간 이상 길어야 합니다`);
    }
  };
  phase('기본 구간', s);
  phase('마지막 구간', s.finalPhase);
  if (!(s.claimWindowMinutes > 0)) problems.push('수락 기한은 0분보다 길어야 합니다');
  if (!(s.drawCloseBeforeStartHours >= 0)) problems.push('추첨 마감은 0시간 이상이어야 합니다');
  return [...new Set(problems)];
}

/** Settings stored on the event, filled from the defaults where a field is missing. */
export function lotterySettingsOf(raw: unknown): LotterySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LotterySettings>;
  return {
    ...DEFAULT_LOTTERY,
    ...r,
    finalPhase: { ...DEFAULT_LOTTERY.finalPhase, ...(r.finalPhase ?? {}) },
  };
}

export const drawCloseAt = (s: LotterySettings, eventStartMs: number) => eventStartMs - s.drawCloseBeforeStartHours * HOUR;

/** Which phase an announcement at this instant belongs to. */
export const phaseAt = (s: LotterySettings, atMs: number, eventStartMs: number): LotteryPhase =>
  atMs >= eventStartMs - s.finalPhase.startsBeforeHours * HOUR ? s.finalPhase : s;

/** The first announcement strictly after now, or null when the draw has closed. */
export function nextAnnouncement(s: LotterySettings, nowMs: number, eventStartMs: number): number | null {
  const close = drawCloseAt(s, eventStartMs);
  const seoulDay = Math.floor((nowMs + SEOUL_OFFSET) / DAY) * DAY - SEOUL_OFFSET; // 00:00 Seoul, as UTC ms
  const times = [...new Set([...s.announceTimes, ...s.finalPhase.announceTimes])];
  for (let day = seoulDay; day <= close; day += DAY) {
    const hits = times
      .map((t) => ({ t, at: day + minutesOf(t) * MINUTE }))
      // A time counts only on days where its own phase is in force.
      .filter(({ t, at }) => at > nowMs && at <= close && phaseAt(s, at, eventStartMs).announceTimes.includes(t))
      .map(({ at }) => at)
      .sort((a, b) => a - b);
    if (hits.length) return hits[0];
  }
  return null;
}

/**
 * The secret draw (snapshot) time for an announcement: at least minDrawGapHours after the previous
 * announcement (any time from now for the first round), not in the past, and before the commit that precedes
 * this announcement. Null when no such time exists; the pool then waits for the next announcement.
 */
export function pickDrawTime(
  s: LotterySettings,
  previousAnnounceMs: number | null,
  announceMs: number,
  eventStartMs: number,
  nowMs: number,
  rng: () => number,
): number | null {
  const afterGap = previousAnnounceMs === null ? nowMs : previousAnnounceMs + phaseAt(s, announceMs, eventStartMs).minDrawGapHours * HOUR;
  const earliest = Math.max(afterGap, nowMs);
  const latest = announceMs - COMMIT_LEAD_MS - MINUTE;
  if (earliest > latest) return null;
  return Math.floor(earliest + rng() * (latest - earliest));
}

export const claimDeadline = (s: LotterySettings, announcedAtMs: number) => announcedAtMs + s.claimWindowMinutes * MINUTE;
