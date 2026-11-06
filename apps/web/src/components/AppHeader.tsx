import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft } from '@/components/icons';
import { useNavigate } from 'react-router-dom';
import { cx } from './cx';
import { IconButton } from './IconButton';

type Props = {
  title: string;
  /** 뒤로가기 버튼. true면 history back, 문자열이면 해당 경로로 */
  back?: boolean | string;
  right?: ReactNode;
};

/**
 * 높이 56px, 가운데 제목은 muted (DESIGN.md 5장).
 * 스크롤해서 내용이 머리 뒤로 들어가면 머리 둘레를 흐린 캔버스로 덮어(`header-scrim`) 카드가 비쳐 겹쳐 보이지 않게 한다.
 * 맨 위에서는 덮개가 없어서 화면 위 안개가 그대로 보인다.
 */
export function AppHeader({ title, back, right }: Props) {
  const navigate = useNavigate();
  const onBack = () => (typeof back === 'string' ? navigate(back) : navigate(-1));
  const bar = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // 화면을 스크롤하는 가장 가까운 상자(MobileLayout의 스크롤 영역). 없으면 창
    let box: HTMLElement | null = bar.current?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const target: HTMLElement | Window = box ?? window;
    const read = () => setScrolled((box ? box.scrollTop : window.scrollY) > 4);
    read();
    target.addEventListener('scroll', read, { passive: true });
    return () => target.removeEventListener('scroll', read);
  }, []);
  return (
    <>
      <div ref={bar} className={cx('sticky top-0 z-10 -mb-4 shrink-0 px-5 pb-4 pt-4', scrolled && 'header-scrim')}>
        <header className="navigation-surface grid h-14 grid-cols-[1fr_auto_1fr] items-center rounded-full px-4">
          <div className="flex">{back && <IconButton icon={ChevronLeft} label="뒤로" onClick={onBack} />}</div>
          <h1 className="text-center text-heading text-ink-2">{title}</h1>
          <div className="flex justify-end gap-2">{right}</div>
        </header>
      </div>
    </>
  );
}
