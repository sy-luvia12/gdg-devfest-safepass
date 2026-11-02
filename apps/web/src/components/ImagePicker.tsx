import { useId, type ChangeEvent } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { cx } from './cx';

type Props = {
  label: string;
  hint: string;
  value: string | null;
  onChange: (dataUrl: string) => void;
  shape: 'face' | 'card';
};

const MAX_SIDE = 480;

/** 사진 고르기. 미리보기용으로 줄여서 data URL로 넘긴다 (프로토타입은 업로드하지 않음) */
export function ImagePicker({ label, hint, value, onChange, shape }: Props) {
  const id = useId();
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onChange(await shrink(file));
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-ink-2">{label}</p>
      <label
        htmlFor={id}
        className={cx(
          'relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-[1.5px] border-dashed border-line bg-surface transition duration-200 focus-within:border-lavender',
          shape === 'face' ? 'mx-auto h-40 w-40 rounded-full' : 'aspect-[16/10] w-full',
        )}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink-2">
              <RefreshCw size={16} strokeWidth={1.75} />
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-caption text-ink-2">
            <Camera size={24} strokeWidth={1.75} />
            {hint}
          </span>
        )}
        <input id={id} type="file" accept="image/*" capture={shape === 'face' ? 'user' : 'environment'} className="sr-only" onChange={onFile} />
      </label>
    </div>
  );
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
