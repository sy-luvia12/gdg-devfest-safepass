import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { eventTitle } from '@/app/format';
import { cx } from './cx';

/** 관리자·스태프가 볼 학교와 행사를 고른다. 고를 것이 2개 이상인 칸만 보인다 */
export function SchoolSwitcher({ className }: { className?: string }) {
  const { school, schools, events, eventId, selectSchool, selectEvent } = useAuth();
  if (!school) return null;
  const showSchools = schools.length > 1;
  const showEvents = events.length > 1;
  if (!showSchools && !showEvents) return null;
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {showSchools && (
        <Select
          label="학교 선택"
          value={school.id}
          options={schools.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(id) => void selectSchool(id)}
        />
      )}
      {showEvents && (
        <Select
          label="행사 선택"
          value={eventId ?? ''}
          options={events.map((e) => ({ value: e.id, label: eventTitle(e) }))}
          onChange={selectEvent}
        />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative inline-flex h-8 min-w-0 items-center rounded-full bg-surface">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 max-w-[12rem] cursor-pointer appearance-none truncate rounded-full bg-transparent pl-3 pr-8 text-label text-ink outline-none focus-visible:ring-2 focus-visible:ring-lavender"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={1.75} className="pointer-events-none absolute right-3 text-ink-2" />
    </label>
  );
}
