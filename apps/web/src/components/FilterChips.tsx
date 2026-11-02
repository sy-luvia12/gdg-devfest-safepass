import { cx } from './cx';

type Option<T extends string> = { value: T; label: string; count?: number };

/** 칩 모양 필터 (DESIGN.md 5장 Chip). 선택됨: lavender 배경 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-label transition duration-200',
            value === o.value ? 'bg-lavender text-ink' : 'bg-surface text-ink-2',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
