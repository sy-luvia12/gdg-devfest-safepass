import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { Check, ImageUp, Palette, School as SchoolIcon } from '@/components/icons';
import { extractColors } from '@/app/extractColors';
import { buildTheme } from '@/app/theme';
import { updateEventTheme } from '@/lib/api';
import type { Event, EventTheme, School } from '@/types';
import { Button } from './Button';
import { cx } from './cx';

type Props = { event: Event; school: School; onApplied: (event: Event) => void };

const SAMPLE_POSTERS = [
  { src: '/mock/posters/sunset.svg', label: '노을' },
  { src: '/mock/posters/ocean.svg', label: '바다' },
  { src: '/mock/posters/neon.svg', label: '네온' },
];

/** 관리자: 행사 테마를 학교 상징색 또는 행사 디자인(포스터) 색으로 정한다 (DESIGN.md 2.1) */
export function ThemeEditor({ event, school, onApplied }: Props) {
  const [source, setSource] = useState<EventTheme['source']>(event.theme.source);
  const [colors, setColors] = useState<string[]>(event.theme.colors);
  const [poster, setPoster] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  // 미리보기는 이 영역에만 변수를 걸어서 전체 화면 테마는 그대로 둔다
  const seedKey = (source === 'event' && colors.length > 0 ? colors : [school.brandColor]).join(',');
  const previewVars = useMemo(() => buildTheme(seedKey.split(',')) as CSSProperties, [seedKey]);

  const dirty =
    source !== event.theme.source || (source === 'event' && colors.join() !== event.theme.colors.join());
  const canApply = dirty && (source === 'school' || colors.length > 0);

  const loadPoster = async (src: string) => {
    setPoster(src);
    setExtracting(true);
    setExtractError(false);
    try {
      const picked = await extractColors(src);
      if (picked.length === 0) throw new Error('no colors');
      setColors(picked);
    } catch {
      setExtractError(true);
    } finally {
      setExtracting(false);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    void loadPoster(objectUrl.current);
  };

  const onApply = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const updated = await updateEventTheme(event.id, { source, colors: source === 'event' ? colors : [] });
      onApplied(updated);
      setSavedAt(Date.now());
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-bg p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading text-ink">행사 테마</h2>
        <p className="text-caption text-ink-2">입장권 카드, 주 버튼, 로그인 화면의 포인트 색이 바뀌어요</p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <div role="radiogroup" aria-label="테마 기준" className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1">
            <SourceTab active={source === 'school'} onClick={() => setSource('school')} icon={SchoolIcon}>
              학교 상징색
            </SourceTab>
            <SourceTab active={source === 'event'} onClick={() => setSource('event')} icon={Palette}>
              행사 디자인
            </SourceTab>
          </div>

          {source === 'school' ? (
            <div className="flex items-center gap-4 rounded-md bg-surface p-4">
              <span className="h-10 w-10 shrink-0 rounded-full" style={{ backgroundColor: school.brandColor }} />
              <div className="min-w-0">
                <p className="text-body text-ink">{school.name} 상징색</p>
                <p className="text-caption text-ink-2 tabular">{school.brandColor}</p>
              </div>
              <p className="ml-auto hidden max-w-[220px] text-caption text-ink-3 sm:block">
                상징색을 연하게 바꾸고 양옆 색을 더해 그라데이션을 만들어요
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-label text-ink transition duration-200 hover:bg-surface-2 focus-within:ring-2 focus-within:ring-lavender">
                  <ImageUp size={16} strokeWidth={1.75} />
                  포스터 이미지 올리기
                  <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
                </label>
                <span className="text-caption text-ink-3">이미지는 색을 뽑는 데만 쓰고 저장하지 않아요</span>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-caption text-ink-2">샘플 포스터로 해보기</p>
                <div className="flex gap-3">
                  {SAMPLE_POSTERS.map((p) => (
                    <button
                      key={p.src}
                      type="button"
                      onClick={() => void loadPoster(p.src)}
                      className={cx(
                        'overflow-hidden rounded-md border-2 transition duration-200',
                        poster === p.src ? 'border-ink' : 'border-transparent',
                      )}
                    >
                      <img src={p.src} alt={`${p.label} 샘플 포스터`} className="h-24 w-[68px] object-cover" />
                    </button>
                  ))}
                  {poster && !SAMPLE_POSTERS.some((p) => p.src === poster) && (
                    <img src={poster} alt="올린 포스터" className="h-24 w-[68px] rounded-md border-2 border-ink object-cover" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-caption text-ink-2">
                  {extracting ? '색을 뽑는 중이에요' : '뽑은 색 (눌러서 직접 고칠 수 있어요)'}
                </p>
                {extractError ? (
                  <p role="alert" className="text-caption text-danger">
                    색을 뽑지 못했어요. 색이 더 뚜렷한 이미지를 올려 주세요
                  </p>
                ) : colors.length === 0 ? (
                  <p className="text-caption text-ink-3">포스터를 고르면 대표색 3개를 뽑아요</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {colors.map((c, i) => (
                      <label key={i} className="flex cursor-pointer items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3">
                        <span className="relative h-8 w-8 overflow-hidden rounded-full" style={{ backgroundColor: c }}>
                          <input
                            type="color"
                            value={c}
                            aria-label={`${i + 1}번째 색`}
                            onChange={(e) => setColors((prev) => prev.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          />
                        </span>
                        <span className="text-label text-ink tabular">{c}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <p className="mb-2 text-caption text-ink-2">미리보기</p>
          <div style={previewVars} className="flex items-center gap-4 rounded-md bg-surface p-4">
            <div className="flex aspect-[3/4] w-28 shrink-0 flex-col justify-between rounded-lg bg-grad-ticket p-3 shadow-float">
              <p className="truncate text-caption font-medium text-ink">{event.name}</p>
              <div className="mx-auto h-12 w-12 rounded-md bg-bg" />
              <div className="h-5 rounded-md bg-white/70" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div className="h-16 w-16 rounded-full bg-grad-orb" />
              <div className="flex h-9 w-full items-center justify-center rounded-full bg-grad-button text-label text-ink">
                입장권 받기
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {saveError && <p className="text-caption text-danger">적용하지 못했어요. 다시 시도해 주세요</p>}
        {!saveError && savedAt && !dirty && (
          <p className="flex items-center gap-1 text-caption text-success">
            <Check size={14} strokeWidth={1.75} />
            적용했어요. 학생 화면은 새로 열 때 바뀌어요
          </p>
        )}
        <Button size="sm" loading={saving} disabled={!canApply} onClick={onApply}>
          테마 적용
        </Button>
      </div>
    </section>
  );
}

function SourceTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Palette;
  children: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'flex h-10 items-center justify-center gap-2 rounded-full text-label transition duration-200',
        active ? 'bg-bg text-ink shadow-soft' : 'text-ink-2',
      )}
    >
      <Icon size={16} strokeWidth={1.75} />
      {children}
    </button>
  );
}
