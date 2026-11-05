// 운영진 명단 편집: 붙여넣기 읽기와 CSV 내려받기
import type { OpsRosterRow } from '@/types';

export type Draft = { name: string; studentId: string; email: string };
export const emptyDraft: Draft = { name: '', studentId: '', email: '' };

/** 구글 시트에서 복사한 줄(탭 구분)이나 CSV를 읽는다. 첫 줄에 이름·학번 제목이 있으면 그 순서를 따른다 */
export function parsePasted(text: string, withEmail: boolean): Draft[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]);
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const at = { name: find(/^(이름|성명|name)$/i), studentId: find(/^(학번|student\s*id)$/i), email: find(/(이메일|메일|e-?mail)$/i) };
  const hasHeader = at.name >= 0 && at.studentId >= 0;
  const cols = hasHeader ? at : { name: 0, studentId: 1, email: withEmail ? 2 : -1 };
  return (hasHeader ? lines.slice(1) : lines).map((l) => {
    const c = split(l);
    return { name: c[cols.name] ?? '', studentId: c[cols.studentId] ?? '', email: cols.email >= 0 ? (c[cols.email] ?? '') : '' };
  });
}

export function downloadCsv(filename: string, rows: OpsRosterRow[], withEmail: boolean) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = withEmail ? ['이름', '학번', '이메일'] : ['이름', '학번'];
  const body = rows.map((r) => (withEmail ? [r.name, r.studentId, r.email ?? ''] : [r.name, r.studentId]).map(esc).join(','));
  // 엑셀·구글 시트가 한글을 깨지 않게 BOM을 붙인다
  const blob = new Blob(['﻿' + [header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

