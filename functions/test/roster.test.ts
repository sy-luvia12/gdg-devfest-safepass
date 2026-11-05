import { describe, expect, it } from 'vitest';
import {
  decidePrecheck,
  eventRowProblem,
  isProfilePhoto,
  matchEventRow,
  matchStudent,
  parseEventRosterRows,
  parseRosterRows,
  parseSheetId,
  planWaitlist,
  studentRowProblem,
} from '../src/domain/roster';

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

describe('decidePrecheck', () => {
  const row = { name: '김하늘', studentId: '2024001', email: 'kim@korea.ac.kr' };
  const claimed = { ...row, claimedBy: 'uid-1' };

  describe('sign-up (with name)', () => {
    it('lets a free row through', () => {
      expect(decidePrecheck(row, { email: 'kim@korea.ac.kr', name: '김하늘' })).toBe('OK');
    });

    it('answers a wrong name like a missing row', () => {
      expect(decidePrecheck(row, { email: 'kim@korea.ac.kr', name: '이도윤' })).toBe('NOT_IN_ROSTER');
      expect(decidePrecheck(null, { email: 'kim@korea.ac.kr', name: '김하늘' })).toBe('NOT_IN_ROSTER');
    });

    it('rejects another email and a row someone already signed up with', () => {
      expect(decidePrecheck(row, { email: 'friend@korea.ac.kr', name: '김하늘' })).toBe('EMAIL_MISMATCH');
      expect(decidePrecheck(claimed, { email: 'kim@korea.ac.kr', name: '김하늘' })).toBe('STUDENT_ID_TAKEN');
    });
  });

  describe('sign-in by student id (no name)', () => {
    it('needs the row email and a finished sign-up', () => {
      expect(decidePrecheck(claimed, { email: 'KIM@korea.ac.kr' })).toBe('OK');
      expect(decidePrecheck(row, { email: 'kim@korea.ac.kr' })).toBe('NOT_REGISTERED');
      expect(decidePrecheck(null, { email: 'kim@korea.ac.kr' })).toBe('NOT_IN_ROSTER');
    });

    it('answers another email exactly like a student id that is not on the roster', () => {
      const missing = decidePrecheck(null, { email: 'friend@korea.ac.kr' });
      expect(decidePrecheck(claimed, { email: 'friend@korea.ac.kr' })).toBe(missing);
      expect(decidePrecheck(row, { email: 'friend@korea.ac.kr' })).toBe(missing);
      expect(missing).toBe('NOT_IN_ROSTER');
    });
  });
});

describe('isProfilePhoto', () => {
  it('accepts a small JPEG data URL', () => {
    expect(isProfilePhoto('data:image/jpeg;base64,/9j/4AAQSkZJRg==', 300_000)).toBe(true);
  });

  it('rejects other types, broken data and photos over the limit', () => {
    expect(isProfilePhoto('data:image/png;base64,iVBORw0KGgo=', 300_000)).toBe(false);
    expect(isProfilePhoto('https://example.com/me.jpg', 300_000)).toBe(false);
    expect(isProfilePhoto(`data:image/jpeg;base64,${'A'.repeat(400_004)}`, 300_000)).toBe(false);
  });
});

describe('studentRowProblem', () => {
  it('accepts a full row on an allowed domain and names the first problem otherwise', () => {
    expect(studentRowProblem({ name: '김하늘', studentId: '2024001', email: 'a@korea.ac.kr' }, KU)).toBeNull();
    expect(studentRowProblem({ name: '', studentId: '2024001', email: 'a@korea.ac.kr' }, KU)).toBe('MISSING_FIELD');
    expect(studentRowProblem({ name: '김하늘', studentId: '20/24', email: 'a@korea.ac.kr' }, KU)).toBe('BAD_STUDENT_ID');
    expect(studentRowProblem({ name: '김하늘', studentId: '2024001', email: 'a@gmail.com' }, KU)).toBe('BAD_DOMAIN');
  });
});

describe('parseEventRosterRows', () => {
  it('needs only 이름 and 학번, ignores an email column, and keeps sheet row numbers', () => {
    const parsed = parseEventRosterRows([
      ['학번', '이름', '이메일'],
      ['2024001', '김하늘', 'ignored@gmail.com'],
      [],
      ['', '이도윤'],
      ['2024001', '박서연'],
      ['2024/04', '최민준'],
      ['2024005', '정지우'],
    ]);
    expect(parsed).toEqual({
      ok: true,
      rows: [
        { name: '김하늘', studentId: '2024001' },
        { name: '정지우', studentId: '2024005' },
      ],
      sheetRows: [2, 7],
      skipped: [
        { row: 4, reason: 'MISSING_FIELD' },
        { row: 5, reason: 'DUPLICATE_STUDENT_ID' },
        { row: 6, reason: 'BAD_STUDENT_ID' },
      ],
    });
  });

  it('fails without a 학번 column', () => {
    expect(parseEventRosterRows([['이름', '이메일']])).toEqual({ ok: false, reason: 'MISSING_COLUMNS' });
  });

  it('checks a single row the same way', () => {
    expect(eventRowProblem({ name: '김하늘', studentId: '2024001' })).toBeNull();
    expect(eventRowProblem({ name: '김하늘', studentId: '' })).toBe('MISSING_FIELD');
  });
});

describe('matchEventRow', () => {
  const row = { name: '김 하늘', studentId: '2024001' };
  it('matches the school roster row of the same id by name, ignoring spaces', () => {
    expect(matchEventRow(row, { name: '김하늘' })).toBe('OK');
    expect(matchEventRow(row, { name: '이도윤' })).toBe('NAME_MISMATCH');
    expect(matchEventRow(row, null)).toBe('NOT_IN_STUDENT_ROSTER');
  });
});

describe('planWaitlist', () => {
  const school = new Map([
    ['2024001', { name: '김하늘', email: 'Sky@korea.ac.kr' }],
    ['2024002', { name: '이도윤', email: 'doyoon@korea.ac.kr' }],
    ['2024003', { name: '박서연', email: 'seo@korea.ac.kr' }],
    ['2024004', { name: '최민준', email: 'min@korea.ac.kr' }],
  ]);
  const parsed = {
    rows: [
      { name: '이도윤', studentId: '2024002' },
      { name: '김하늘', studentId: '2024001' },
      { name: '없는학생', studentId: '2099999' },
      { name: '다른이름', studentId: '2024003' },
      { name: '최민준', studentId: '2024004' },
    ],
    sheetRows: [2, 3, 4, 5, 6],
  };

  it('keeps the sheet order, finds emails in the school roster and reports rows that do not match', () => {
    const plan = planWaitlist(parsed, school, []);
    expect(plan.upserts).toEqual([
      { email: 'doyoon@korea.ac.kr', name: '이도윤', studentId: '2024002', order: 1 },
      { email: 'sky@korea.ac.kr', name: '김하늘', studentId: '2024001', order: 2 },
      { email: 'min@korea.ac.kr', name: '최민준', studentId: '2024004', order: 3 },
    ]);
    expect(plan.skipped).toEqual([
      { row: 4, reason: 'NOT_IN_STUDENT_ROSTER' },
      { row: 5, reason: 'NAME_MISMATCH' },
    ]);
    expect(plan.deletes).toEqual([]);
  });

  it('drops waiting entries the sheet no longer lists and never touches settled ones', () => {
    const plan = planWaitlist(parsed, school, [
      { email: 'gone@korea.ac.kr', status: 'waiting' },
      { email: 'old@korea.ac.kr', status: 'assigned' },
      { email: 'sky@korea.ac.kr', status: 'assigned' },
      { email: 'doyoon@korea.ac.kr', status: 'waiting' },
    ]);
    expect(plan.deletes).toEqual(['gone@korea.ac.kr']);
    expect(plan.upserts.map((u) => [u.email, u.order])).toEqual([
      ['doyoon@korea.ac.kr', 1],
      ['min@korea.ac.kr', 2],
    ]);
  });
});
