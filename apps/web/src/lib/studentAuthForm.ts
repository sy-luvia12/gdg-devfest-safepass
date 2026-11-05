import { ApiError } from '../types.ts';

export type StudentFields = { name: string; studentId: string; email: string };
export type StudentFieldErrors = Partial<Record<keyof StudentFields, string>>;

export function validateStudentFields(fields: StudentFields, signup: boolean): StudentFieldErrors {
  const errors: StudentFieldErrors = {};
  if (signup && !fields.name.trim()) errors.name = '이름을 입력해 주세요.';
  if (!fields.studentId.trim()) errors.studentId = '학번을 입력해 주세요.';
  else if (!/^\d+$/.test(fields.studentId.trim())) errors.studentId = '학번은 숫자로 입력해 주세요.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) errors.email = '올바른 이메일 주소를 입력해 주세요.';
  return errors;
}

export function studentAuthMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  switch (error.code) {
    case 'not_in_roster': return '학적 명단과 일치하지 않아요. 학교·이름·학번을 다시 확인해 주세요.';
    case 'email_mismatch': return '해당 학번에 등록된 이메일과 달라요. 학교에 등록한 이메일을 확인해 주세요.';
    case 'student_id_taken': return '이미 가입된 학번이에요. 로그인해 주세요.';
    case 'not_registered': return '가입 정보가 없거나 학적 확인이 필요해요. 회원가입부터 진행해 주세요.';
    case 'not_school_account': return '가입 가능한 학교의 이메일인지 확인해 주세요.';
    case 'device_blocked': return '다른 기기에 등록된 계정이에요. 기기 초기화를 요청해 주세요.';
    case 'invalid_state': return '링크가 만료되었거나 이미 사용됐어요. 새 인증 메일을 요청해 주세요.';
    case 'unauthenticated': return '로그인이 만료됐어요. 새 인증 메일로 다시 로그인해 주세요.';
    default: return '요청을 처리하지 못했어요. 연결 상태와 서비스 설정을 확인하고 다시 시도해 주세요.';
  }
}
