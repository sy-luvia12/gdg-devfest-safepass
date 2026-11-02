import type { Role, User } from '@/types';

/** 권한이 없는 경로에 들어왔을 때 돌려보낼 역할별 첫 화면 */
export function homePathFor(role: Role): string {
  if (role === 'admin') return '/admin';
  if (role === 'staff') return '/staff/scan';
  return '/ticket';
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
