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
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const u = await api.getCurrentUser();
      if (u) {
        setSchool(await api.getSchool(u.schoolId));
        setUser(u);
      }
    })()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async () => {
    const u = await api.signInWithSchoolAccount();
    const s = await api.getSchool(u.schoolId);
    setSchool(s);
    setUser(u);
    return { user: u, school: s };
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setSchool(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.getCurrentUser();
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, school, loading, signIn, signOut, refreshUser }),
    [user, school, loading, signIn, signOut, refreshUser],
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
