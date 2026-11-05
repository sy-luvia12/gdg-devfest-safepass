import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ApiError } from '../src/types.ts';
import { studentAuthMessage, validateStudentFields } from '../src/lib/studentAuthForm.ts';

const student = { name: '윤지호', studentId: '20242000', email: 'member1@hanbit.ac.kr' };

test('가입은 이름·숫자 학번·이메일을 요구하고 학번 길이를 고정하지 않는다', () => {
  assert.deepEqual(validateStudentFields(student, true), {});
  for (const studentId of ['1', '2024000000001']) assert.deepEqual(validateStudentFields({ ...student, studentId }, true), {});
  assert.ok(validateStudentFields({ ...student, name: ' ' }, true).name);
  assert.ok(validateStudentFields({ ...student, studentId: 'ABC123' }, true).studentId);
  assert.ok(validateStudentFields({ ...student, studentId: '' }, true).studentId);
});

test('로그인은 이름 없이 학번과 이메일로 진행한다', () => {
  assert.deepEqual(validateStudentFields({ ...student, name: '' }, false), {});
  assert.ok(validateStudentFields({ ...student, email: 'broken' }, false).email);
});

test('이메일 서비스 제공자를 임의로 Google로 제한하지 않는다', () => {
  for (const email of ['student@naver.com', 'student@outlook.com', 'student@yahoo.com', 'student@university.ac.kr']) {
    assert.deepEqual(validateStudentFields({ ...student, email }, true), {});
  }
});

test('이미 가입·학적 불일치·미가입·만료 링크를 구분해서 안내한다', () => {
  assert.match(studentAuthMessage(new ApiError('student_id_taken')), /이미 가입/);
  assert.match(studentAuthMessage(new ApiError('email_mismatch')), /등록된 이메일/);
  assert.match(studentAuthMessage(new ApiError('not_registered')), /회원가입/);
  assert.match(studentAuthMessage(new ApiError('not_in_roster')), /학적 명단/);
  assert.match(studentAuthMessage(new ApiError('invalid_state')), /새 인증 메일/);
});

test('예상하지 못한 오류 내용이나 내부 정보는 화면에 노출하지 않는다', () => {
  const message = studentAuthMessage(new Error('secret backend details'));
  assert.doesNotMatch(message, /secret/);
  assert.match(message, /다시 시도/);
});
