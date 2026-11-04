import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '@/lib/api';
import type { Event, School, User } from '@/types';

/** 보고 있는 학교와 그 학교의 행사들. eventId는 그중 지금 보고 있는 행사 (행사가 없으면 null).
 * school이 null이면 학교 관리자의 스페이스가 아직 없다 → /admin/setup */
type Scope = { school: School | null; events: Event[]; eventId: string | null };

type AuthState = {
  user: User | null;
  /** 보고 있는 학교. 테마 기본색이 여기서 나온다. 학생은 자기 학교 */
  school: School | null;
  /** 보고 있는 학교가 참여하는 행사들 (날짜순) */
  events: Event[];
  /** 지금 보고 있는 행사. 화면은 useEventId()로 읽는다 */
  eventId: string | null;
  loading: boolean;
  signIn: () => Promise<{ user: User } & Scope>;
  signOut: () => Promise<void>;
  /** 승인 요청·기기 초기화 등으로 내 정보가 바뀐 뒤 다시 읽는다 */
  refreshUser: () => Promise<User | null>;
  /** 관리자·스태프가 고를 수 있는 학교. 학생은 빈 배열 */
  schools: School[];
  /** 관리자·스태프가 보는 학교를 바꾼다. 그 학교의 행사 중 지난번 것이나 첫 행사로 간다 */
  selectSchool: (schoolId: string) => Promise<void>;
  /** 보고 있는 행사를 바꾼다. 다음에 들어와도 유지된다 */
  selectEvent: (eventId: string) => void;
  /** 스페이스·행사를 만든 뒤 학교와 행사 목록을 다시 읽는다. eventId를 주면 그 행사를 고른다 */
  refreshScope: (eventId?: string) => Promise<void>;
};

const SCHOOL_KEY = 'safepass-school';
const EVENT_KEY = 'safepass-event';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 브라우저는 매번 첫 학교·첫 행사로 시작한다
  }
}

/** 학교의 행사 목록을 읽고, 지난번에 본 행사가 있으면 그 행사를 고른다 */
async function scopeFor(school: School): Promise<Scope> {
  const events = await api.listEvents(school.id);
  const last = stored(EVENT_KEY);
  const pick =
    events.find((e) => e.id === last) ?? events.find((e) => e.id === school.currentEventId) ?? events[0];
  return { school, events, eventId: pick?.id ?? null };
}

/** 학생은 자기 학교. 관리자·스태프는 지난번에 고른 학교, 없으면 자기 학교나 첫 학교 */
async function resolve(u: User): Promise<Scope & { schools: School[] }> {
  if (u.role === 'student') return { ...(await scopeFor(await api.getSchool(u.schoolId))), schools: [] };
  // 학교 관리자·스태프는 자기 학교만. 관리자가 스페이스를 아직 안 만들었으면 학교 없이 들어온다
  const ownSchoolId = u.role === 'admin' ? u.adminSchoolId : u.staffSchoolId;
  if (ownSchoolId) {
    const own = await api.getSchool(ownSchoolId).catch(() => null);
    return own ? { ...(await scopeFor(own)), schools: [own] } : { school: null, events: [], eventId: null, schools: [] };
  }
  const schools = await api.listSchools();
  const last = stored(SCHOOL_KEY);
  const pick = schools.find((s) => s.id === last) ?? schools.find((s) => s.id === u.schoolId) ?? schools[0];
  const school = pick ? await api.getSchool(pick.id) : await api.getSchool(u.schoolId);
  return { ...(await scopeFor(school)), schools };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((u: User, r: Scope & { schools: School[] }) => {
    setScope({ school: r.school, events: r.events, eventId: r.eventId });
    setSchools(r.schools);
    setUser(u);
  }, []);

  useEffect(() => {
    (async () => {
      const u = await api.getCurrentUser();
      if (u) apply(u, await resolve(u));
    })()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [apply]);

  const signIn = useCallback(async () => {
    const u = await api.signInWithSchoolAccount();
    const r = await resolve(u);
    apply(u, r);
    return { user: u, school: r.school, events: r.events, eventId: r.eventId };
  }, [apply]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setScope(null);
    setSchools([]);
  }, []);

  const selectSchool = useCallback(async (schoolId: string) => {
    const next = await scopeFor(await api.getSchool(schoolId));
    store(SCHOOL_KEY, schoolId);
    if (next.eventId) store(EVENT_KEY, next.eventId);
    setScope(next);
    // 방금 만든 스페이스는 목록에 아직 없다
    if (!schools.some((s) => s.id === schoolId)) setSchools(await api.listSchools());
  }, [schools]);

  const selectEvent = useCallback((eventId: string) => {
    store(EVENT_KEY, eventId);
    setScope((s) => (s && s.events.some((e) => e.id === eventId) ? { ...s, eventId } : s));
  }, []);

  const refreshScope = useCallback(
    async (eventId?: string) => {
      if (!user) return;
      if (eventId) store(EVENT_KEY, eventId);
      const r = await resolve(user);
      setScope({ school: r.school, events: r.events, eventId: r.eventId });
      setSchools(r.schools);
    },
    [user],
  );

  const refreshUser = useCallback(async () => {
    const u = await api.getCurrentUser();
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      school: scope?.school ?? null,
      events: scope?.events ?? [],
      eventId: scope?.eventId ?? null,
      loading,
      signIn,
      signOut,
      refreshUser,
      schools,
      selectSchool,
      selectEvent,
      refreshScope,
    }),
    [user, scope, loading, signIn, signOut, refreshUser, schools, selectSchool, selectEvent, refreshScope],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** 지금 보고 있는 행사 id. RequireEvent 안쪽 화면에서만 쓴다 (행사가 없으면 그 앞에서 막힌다). */
export function useEventId(): string {
  const { eventId } = useAuth();
  if (!eventId) throw new Error('useEventId needs a selected event');
  return eventId;
}
