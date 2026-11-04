import { describe, expect, it } from 'vitest';
import { matchStudent, parseRosterRows, parseSheetId } from '../src/domain/roster';

const KU = ['korea.ac.kr'];
const SHEET = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0';

describe('parseSheetId', () => {
  it('reads the id from a sheet URL', () => {
    expect(parseSheetId(SHEET)).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
  });

  it.each(['', 'https://example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz'])(
    'rejects %j',
    (url) => expect(parseSheetId(url)).toBeNull(),
  );
});

describe('parseRosterRows', () => {
  it('finds columns by header name in any order', () => {
    const parsed = parseRosterRows(
      [
        ['학교 이메일', '학번', '이름'],
        ['Kim@Korea.ac.kr ', '2024001', '김하늘'],
      ],
      KU,
    );
    expect(parsed).toEqual({ ok: true, rows: [{ name: '김하늘', studentId: '2024001', email: 'kim@korea.ac.kr' }], skipped: [] });
  });

  it('fails when a column is missing', () => {
    expect(parseRosterRows([['이름', '학번']], KU)).toEqual({ ok: false, reason: 'MISSING_COLUMNS' });
  });

  it('skips unusable rows with their sheet row number and ignores blank rows', () => {
    const parsed = parseRosterRows(
      [
        ['이름', '학번', '이메일'],
        ['김하늘', '2024001', 'a@korea.ac.kr'],
        [],
        ['이도윤', '', 'b@korea.ac.kr'],
        ['박서연', '2024003', 'c@gmail.com'],
        ['최민준', '2024001', 'd@korea.ac.kr'],
        ['정지우', '2024005', 'A@korea.ac.kr'],
        ['한유진', '2024/06', 'f@korea.ac.kr'],
      ],
      KU,
    );
    expect(parsed.ok && parsed.rows.map((r) => r.studentId)).toEqual(['2024001']);
    expect(parsed.ok && parsed.skipped).toEqual([
      { row: 4, reason: 'MISSING_FIELD' },
      { row: 5, reason: 'BAD_DOMAIN' },
      { row: 6, reason: 'DUPLICATE_STUDENT_ID' },
      { row: 7, reason: 'DUPLICATE_EMAIL' },
      { row: 8, reason: 'BAD_STUDENT_ID' },
    ]);
  });
});

describe('matchStudent', () => {
  const row = { name: '김 하늘', studentId: '2024001', email: 'kim@korea.ac.kr' };

  it('accepts the row owner, ignoring spaces in the name and email case', () => {
    expect(matchStudent(row, '김하늘', 'KIM@korea.ac.kr')).toBe('OK');
  });

  it('rejects another name before checking the email', () => {
    expect(matchStudent(row, '이도윤', 'other@korea.ac.kr')).toBe('NAME_MISMATCH');
  });

  it('rejects a classmate signing up with a friend name and id', () => {
    expect(matchStudent(row, '김하늘', 'friend@korea.ac.kr')).toBe('EMAIL_MISMATCH');
  });
});
