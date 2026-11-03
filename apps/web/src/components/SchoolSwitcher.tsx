import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { cx } from './cx';

/** 관리자·스태프가 볼 학교(행사)를 고른다. 고를 학교가 2곳 이상일 때만 보인다 */
export function SchoolSwitcher({ className }: { className?: string }) {
  const { school, schools, selectSchool } = useAuth();
  if (!school || schools.length < 2) return null;
  return (
    <label className={cx('relative inline-flex h-8 items-center rounded-full bg-surface', className)}>
      <span className="sr-only">학교 선택</span>
      <select
        value={school.id}
        onChange={(e) => selectSchool(e.target.value)}
        className="h-full cursor-pointer appearance-none rounded-full bg-transparent pl-3 pr-8 text-label text-ink outline-none focus-visible:ring-2 focus-visible:ring-lavender"
      >
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={1.75} className="pointer-events-none absolute right-3 text-ink-2" />
    </label>
  );
}
