import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getEvent } from '@/lib/api';
import type { Event } from '@/types';
import { useAuth } from './AuthProvider';
import { applyTheme, themeSeeds } from './theme';

type ThemeState = {
  /** 관리자가 테마를 바꾼 뒤 화면에 바로 반영할 때 호출 */
  setThemeEvent: (event: Event) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

/** 로그인한 학교의 행사 테마(행사 디자인 > 학교 상징색 > 기본)를 :root에 적용한다 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { school, eventId } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    setEvent(null);
    if (!school || !eventId) return;
    let cancelled = false;
    getEvent(eventId)
      .then((e) => !cancelled && setEvent(e))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [school, eventId]);

  useEffect(() => {
    // 로그인 전(로그인 화면)은 항상 SafePass 기본 보라 테마
    applyTheme(school ? themeSeeds(school, event) : null);
  }, [school, event]);

  return <ThemeContext.Provider value={{ setThemeEvent: setEvent }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
