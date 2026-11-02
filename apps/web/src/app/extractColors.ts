// 행사 포스터 이미지에서 대표색 3개를 뽑는다. 이미지는 브라우저 안에서만 쓰고 업로드하지 않는다.

import { rgbToHex, rgbToHsl } from './theme';

const SAMPLE = 64; // 64×64로 줄여서 계산
const BINS = 24; // 색상환 15도 단위
const MIN_HUE_GAP = 2; // 고른 색끼리 최소 30도 이상 떨어지게

export async function extractColors(src: string, count = 3): Promise<string[]> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  // 색상(hue) 구간별로 채도 가중치를 모은다. 거의 흰색·검정·회색 픽셀은 버린다.
  const bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (s < 0.2 || l < 0.12 || l > 0.94) continue;
    const bin = bins[Math.floor(h / (360 / BINS)) % BINS];
    const w = s * (1 - Math.abs(l - 0.5));
    bin.w += w;
    bin.r += rgb[0] * w;
    bin.g += rgb[1] * w;
    bin.b += rgb[2] * w;
  }

  const ranked = bins.map((b, i) => ({ ...b, i })).filter((b) => b.w > 0).sort((x, y) => y.w - x.w);
  const picked: typeof ranked = [];
  for (const b of ranked) {
    const far = picked.every((p) => {
      const d = Math.abs(p.i - b.i);
      return Math.min(d, BINS - d) >= MIN_HUE_GAP;
    });
    if (far) picked.push(b);
    if (picked.length === count) break;
  }
  return picked.map((b) => rgbToHex([b.r / b.w, b.g / b.w, b.b / b.w]));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
