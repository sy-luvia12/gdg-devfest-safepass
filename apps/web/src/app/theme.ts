// 학교 상징색 또는 행사 디자인 색(시드)으로 파스텔 테마를 만든다 (DESIGN.md 2.1)
// 시드가 진한 원색이어도 화면에는 명도를 높인 파스텔만 쓴다. 상태색(성공·거부·주의)은 테마와 무관하게 고정.

import type { Event, School } from '@/types';

type Rgb = [number, number, number];
type Hsl = [number, number, number]; // h 0~360, s 0~1, l 0~1

export type ThemeVars = Record<
  '--c-p1' | '--c-p2' | '--c-p3' | '--c-p4' | '--grad-ticket' | '--grad-button' | '--grad-orb',
  string
>;

const TICKET_L = 0.88; // 그라데이션 카드 명도
const BUTTON_L = 0.93; // 주 버튼은 한 단계 더 연하게
const MAX_S = 0.75;
const MIN_S = 0.35;
const NEIGHBOR_HUE = 28; // 시드 1개일 때 양옆 색상 간격

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function pastel([h, s]: Hsl, l: number): Rgb {
  // 무채색 시드(검정·회색)는 채도를 조금 주어 그라데이션이 회색으로 죽지 않게 한다
  const sat = s < 0.08 ? 0.2 : Math.min(MAX_S, Math.max(MIN_S, s));
  return hslToRgb([h, sat, l]);
}

const css = (c: Rgb) => `rgb(${c.map(Math.round).join(' ')})`;
const triplet = (c: Rgb) => c.map(Math.round).join(' ');

/** 시드 색 1~3개 → 테마 변수. 1개면 색상환 양옆으로 넓혀 3색을 만든다. */
export function buildTheme(seeds: string[]): ThemeVars {
  const hsl = seeds.slice(0, 3).map((s) => rgbToHsl(hexToRgb(s)));
  const [a, b, c] =
    hsl.length >= 3
      ? hsl
      : hsl.length === 2
        ? [hsl[0], hsl[1], [hsl[1][0] + NEIGHBOR_HUE, hsl[1][1], hsl[1][2]] as Hsl]
        : [
            [hsl[0][0] + NEIGHBOR_HUE, hsl[0][1], hsl[0][2]] as Hsl,
            hsl[0],
            [hsl[0][0] - NEIGHBOR_HUE, hsl[0][1], hsl[0][2]] as Hsl,
          ];
  const p1 = pastel(a, TICKET_L);
  const p2 = pastel(b, TICKET_L);
  const p3 = pastel(c, TICKET_L);
  const p4 = pastel([a[0] + NEIGHBOR_HUE, a[1], a[2]], 0.9);
  return {
    '--c-p1': triplet(p1),
    '--c-p2': triplet(p2),
    '--c-p3': triplet(p3),
    '--c-p4': triplet(p4),
    '--grad-ticket': `linear-gradient(160deg, ${css(p1)} 0%, ${css(p2)} 45%, ${css(p3)} 100%)`,
    '--grad-button': `linear-gradient(90deg, ${css(pastel(b, BUTTON_L))} 0%, ${css(pastel(c, BUTTON_L))} 100%)`,
    '--grad-orb': `radial-gradient(circle at 35% 35%, ${css(p4)} 0%, ${css(p3)} 30%, ${css(p2)} 60%, ${css(p1)} 100%)`,
  };
}

/** 행사 디자인 색이 있으면 그것을, 없으면 학교 상징색을 쓴다. 둘 다 없으면 기본 테마(null). */
export function themeSeeds(school: School | null, event: Event | null): string[] | null {
  if (event?.theme.source === 'event' && event.theme.colors.length > 0) return event.theme.colors;
  if (school) return [school.brandColor];
  return null;
}

const KEYS = Object.keys(buildTheme(['#000000'])) as (keyof ThemeVars)[];

export function applyTheme(seeds: string[] | null) {
  const root = document.documentElement.style;
  if (!seeds) {
    KEYS.forEach((k) => root.removeProperty(k));
    return;
  }
  const vars = buildTheme(seeds);
  KEYS.forEach((k) => root.setProperty(k, vars[k]));
}
