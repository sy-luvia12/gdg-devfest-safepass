import { Search } from '@/components/icons';

/** 관리자 목록 검색창 */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 w-full items-center gap-2 rounded-full bg-surface px-4 transition duration-200 focus-within:bg-bg focus-within:ring-[1.5px] focus-within:ring-lavender md:w-64">
      <Search size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-label text-ink outline-none placeholder:text-ink-3"
      />
    </label>
  );
}
