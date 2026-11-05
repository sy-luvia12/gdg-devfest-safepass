import type { Role, User } from '@/types';

/** 블록 익스플로러와 컨트랙트 주소 (.env.local). 기본은 Polygon Amoy */
export const CHAIN_EXPLORER = import.meta.env.VITE_CHAIN_EXPLORER || 'https://amoy.polygonscan.com';
export const CHAIN_CONTRACT = import.meta.env.VITE_CHAIN_CONTRACT || '';

/** 권한이 없는 경로에 들어왔을 때 돌려보낼 역할별 첫 화면 */
export function homePathFor(role: Role): string {
  if (role === 'admin') return '/admin';
  if (role === 'staff') return '/staff/scan';
  return '/events';
}

/**
 * 학생이 입장권 화면을 쓰기 전에 먼저 거쳐야 하는 화면 (기술 설계 2.2~2.3).
 * null이면 막힌 것 없음.
 */
export function studentGatePath(user: User): string | null {
  if (user.role !== 'student') return null;
  if (user.verifyStatus === 'none' || user.verifyStatus === 'rejected') return '/onboarding';
  if (user.verifyStatus === 'pending') return '/onboarding/pending';
  if (user.deviceStatus === 'blocked') return '/device';
  return null;
}

/** 학교가 아직 지정되지 않은 관리자 (예전 팀 관리자 계정 등). 운영진이 /ops에서 학교를 지정해야 관리 화면을 쓴다 */
export function isUnassignedAdmin(user: User): boolean {
  return user.role === 'admin' && !user.adminSchoolId && !user.operator;
}
