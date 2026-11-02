import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './IconButton';

type Props = {
  title: string;
  /** 뒤로가기 버튼. true면 history back, 문자열이면 해당 경로로 */
  back?: boolean | string;
  right?: ReactNode;
};

/** 높이 56px, 가운데 제목은 muted (DESIGN.md 5장) */
export function AppHeader({ title, back, right }: Props) {
  const navigate = useNavigate();
  const onBack = () => (typeof back === 'string' ? navigate(back) : navigate(-1));
  return (
    <header className="sticky top-0 z-10 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-bg/90 px-5 backdrop-blur">
      <div className="flex">{back && <IconButton icon={ChevronLeft} label="뒤로" onClick={onBack} />}</div>
      <h1 className="text-center text-heading text-ink-3">{title}</h1>
      <div className="flex justify-end gap-2">{right}</div>
    </header>
  );
}
