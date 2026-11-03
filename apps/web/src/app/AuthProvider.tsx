import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '@/lib/api';
import type { School, User } from '@/types';

type AuthState = {
  user: User | null;
  /** 로그인한 사람의 학교. 행사 id와 테마 기본색이 여기서 나온다. */
  school: School | null;
  loading: boolean;
  signIn: () => Promise<{ user: User; school: School }>;
  signOut: () => Promise<void>;
  /** 승인 요청·기기 초기화 등으로 내 정보가 바뀐 뒤 다시 읽는다 */
  refreshUser: () => Promise<User | null>;
  /** 관리자·스태프가 고를 수 있는 학교(행사). 학생은 빈 배열 */
  schools: School[];
  /** 관리자·스태프가 보고 있는 학교(행사)를 바꾼다. 다음에 들어와도 유지된다 */
  selectSchool: (schoolId: string) => void;
};

const SCHOOL_KEY = 'safepass-school';

function storedSchoolId(): string | null {
  try {
    return localStorage.getItem(SCHOOL_KEY);
  } catch {
    return null;
  }
}

function storeSchoolId(id: string) {
  try {
    localStorage.setItem(SCHOOL_KEY, id);
  } catch {
    // 저장이 막힌 브라우저는 매번 기본 학교로 시작한다
  }
}

/** 학생은 자기 학교. 관리자·스태프는 지난번에 고른 학교가 목록에 있으면 그 학교 */
async function resolveSchool(u: User): Promise<{ school: School; schools: School[] }> {
  if (u.role === 'student') return { school: await api.getSchool(u.schoolId), schools: [] };
  const schools = await api.listSchools();
  const picked = schools.find((s) => s.id === storedSchoolId()) ?? schools.find((s) => s.id === u.schoolId);
  return { school: picked ?? (await api.getSchool(u.schoolId)), schools };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const u = await api.getCurrentUser();
      if (u) {
        const r = await resolveSchool(u);
        setSchool(r.school);
        setSchools(r.schools);
        setUser(u);
      }
    })()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async () => {
    const u = await api.signInWithSchoolAccount();
    const r = await resolveSchool(u);
    setSchool(r.school);
    setSchools(r.schools);
    setUser(u);
    return { user: u, school: r.school };
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setSchool(null);
    setSchools([]);
  }, []);

  const selectSchool = useCallback(
    (schoolId: string) => {
      const next = schools.find((s) => s.id === schoolId);
      if (!next) return;
      storeSchoolId(schoolId);
      setSchool(next);
    },
    [schools],
  );

  const refreshUser = useCallback(async () => {
    const u = await api.getCurrentUser();
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, school, loading, signIn, signOut, refreshUser, schools, selectSchool }),
    [user, school, loading, signIn, signOut, refreshUser, schools, selectSchool],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** 지금 학교의 행사 id. RequireRole 안쪽 화면에서만 쓴다. */
export function useEventId(): string {
  const { school } = useAuth();
  if (!school) throw new Error('useEventId needs a signed-in user');
  return school.currentEventId;
}
