const pad = (n: number) => String(n).padStart(2, '0');

/** 21:04 */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 21:04:37 */
export function formatTimeSec(ms: number): string {
  const d = new Date(ms);
  return `${formatTime(ms)}:${pad(d.getSeconds())}`;
}

/** 11월 6일 (목) 18:00 */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${day}) ${formatTime(d.getTime())}`;
}

export function formatWon(n: number): string {
  return n === 0 ? '무료' : `${n.toLocaleString('ko-KR')}원`;
}

/** 관리자 화면 학번 마스킹: 20231234 → 2023**34 */
export function maskStudentId(id?: string): string {
  if (!id) return '-';
  if (id.length <= 4) return id;
  return `${id.slice(0, 4)}${'*'.repeat(id.length - 6)}${id.slice(-2)}`;
}

/** 0원도 숫자로 보여줄 때: 0원, 5,000원 */
export function formatPrice(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 11월 6일 21:04 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${formatTime(ms)}`;
}

/** 방금 / 5분 전 / 2시간 전 / 3일 전 */
export function formatAgo(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 화면에 쓰는 행사 이름. 묶음이 있으면 "고연전 · 농구" */
export function eventTitle(e: { name: string; seriesName?: string }): string {
  return e.seriesName ? `${e.seriesName} · ${e.name}` : e.name;
}
