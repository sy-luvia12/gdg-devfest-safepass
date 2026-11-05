import { describe, expect, it } from 'vitest';
import {
  claimDeadline,
  COMMIT_LEAD_MS,
  DEFAULT_LOTTERY,
  drawCloseAt,
  lotterySettingsOf,
  lotterySettingsProblems,
  nextAnnouncement,
  phaseAt,
  pickDrawTime,
} from '../src/domain/lottery';

const H = 3_600_000;
// Seoul wall clock as UTC ms (Seoul is UTC+9 all year).
const seoul = (iso: string) => Date.parse(`${iso}+09:00`);
const START = seoul('2026-11-20T18:00:00'); // event start
const S = DEFAULT_LOTTERY;

describe('lottery settings', () => {
  it('accepts the defaults', () => {
    expect(lotterySettingsProblems(S)).toEqual([]);
  });

  it('refuses night announcements, claim windows past 22:00 and gaps shorter than the draw gap + 1 h', () => {
    expect(lotterySettingsProblems({ ...S, announceTimes: ['05:00'] })).toContain('기본 구간: 발표는 06:00~21:00 사이만 됩니다');
    expect(lotterySettingsProblems({ ...S, announceTimes: ['21:30'] }).length).toBeGreaterThan(0);
    expect(lotterySettingsProblems({ ...S, announceTimes: ['21:00'], claimWindowMinutes: 90 })).toContain('기본 구간: 수락 마감이 22:00을 넘습니다');
    expect(lotterySettingsProblems({ ...S, announceTimes: ['12:00', '20:00'] })).toContain(
      '기본 구간: 발표 간격은 최소 추첨 간격보다 1시간 이상 길어야 합니다',
    );
    expect(lotterySettingsProblems({ ...S, announceTimes: ['12:5'] })).toContain('기본 구간: 발표 시각은 HH:MM이어야 합니다');
  });

  it('fills missing fields from the defaults', () => {
    expect(lotterySettingsOf(undefined)).toEqual(S);
    expect(lotterySettingsOf({ claimWindowMinutes: 30, finalPhase: { minDrawGapHours: 4 } })).toMatchObject({
      claimWindowMinutes: 30,
      announceTimes: ['12:00'],
      finalPhase: { startsBeforeHours: 72, announceTimes: ['10:00', '19:00'], minDrawGapHours: 4 },
    });
  });
});

describe('announcement schedule', () => {
  it('announces at 12:00 Seoul until 72 h before the start, then at 10:00 and 19:00', () => {
    expect(nextAnnouncement(S, seoul('2026-11-10T09:00:00'), START)).toBe(seoul('2026-11-10T12:00:00'));
    expect(nextAnnouncement(S, seoul('2026-11-10T12:00:00'), START)).toBe(seoul('2026-11-11T12:00:00'));
    // 2026-11-17 18:00 is 72 h before. The 12:00 slot that day is still the base phase.
    expect(nextAnnouncement(S, seoul('2026-11-17T11:00:00'), START)).toBe(seoul('2026-11-17T12:00:00'));
    expect(nextAnnouncement(S, seoul('2026-11-17T13:00:00'), START)).toBe(seoul('2026-11-17T19:00:00'));
    expect(nextAnnouncement(S, seoul('2026-11-18T19:30:00'), START)).toBe(seoul('2026-11-19T10:00:00'));
    expect(phaseAt(S, seoul('2026-11-18T10:00:00'), START)).toBe(S.finalPhase);
  });

  it('stops at the draw close (3 h before the start)', () => {
    expect(drawCloseAt(S, START)).toBe(seoul('2026-11-20T15:00:00'));
    expect(nextAnnouncement(S, seoul('2026-11-20T11:00:00'), START)).toBeNull(); // 19:00 is after the close
    expect(nextAnnouncement(S, seoul('2026-11-20T09:00:00'), START)).toBe(seoul('2026-11-20T10:00:00'));
  });

  it('works from a time on the previous UTC day', () => {
    // 2026-11-10 08:00 Seoul is 2026-11-09 23:00 UTC.
    expect(nextAnnouncement(S, Date.parse('2026-11-09T23:00:00Z'), START)).toBe(seoul('2026-11-10T12:00:00'));
  });
});

describe('secret draw time', () => {
  const announce = seoul('2026-11-11T12:00:00');
  const prev = seoul('2026-11-10T12:00:00');
  const now = seoul('2026-11-10T12:05:00');

  it('falls at least the draw gap after the previous announcement and before the commit', () => {
    const lo = pickDrawTime(S, prev, announce, START, now, () => 0)!;
    const hi = pickDrawTime(S, prev, announce, START, now, () => 0.999999)!;
    expect(lo).toBe(prev + 12 * H);
    expect(hi).toBeLessThan(announce - COMMIT_LEAD_MS);
    expect(hi).toBeGreaterThan(lo);
  });

  it('can be any time from now for the first round, never in the past', () => {
    expect(pickDrawTime(S, null, announce, START, now, () => 0)).toBe(now);
    expect(pickDrawTime(S, seoul('2026-11-01T12:00:00'), announce, START, now, () => 0)).toBe(now);
  });

  it('is null when the window is empty, so the pool waits for the next announcement', () => {
    expect(pickDrawTime(S, prev, seoul('2026-11-10T23:00:00'), START, now, () => 0.5)).toBeNull();
  });

  it('uses the final phase gap near the event', () => {
    const a = seoul('2026-11-19T10:00:00');
    expect(pickDrawTime(S, seoul('2026-11-18T19:00:00'), a, START, seoul('2026-11-18T19:01:00'), () => 0)).toBe(seoul('2026-11-19T01:00:00'));
  });

  it('gives a claim deadline claimWindowMinutes after the announcement', () => {
    expect(claimDeadline(S, announce)).toBe(announce + H);
  });
});
