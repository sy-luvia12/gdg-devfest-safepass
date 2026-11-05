import { useId, useState, type ChangeEvent } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { cx } from './cx';

type Props = {
  label: string;
  hint: string;
  value: string | null;
  onChange: (dataUrl: string) => void;
  shape: 'face' | 'card';
  disabled?: boolean;
  onProcessingChange?: (processing: boolean) => void;
};

const MAX_SIDE = 480;

/** 사진 고르기. 미리보기용으로 줄여서 data URL로 넘긴다 (프로토타입은 업로드하지 않음) */
export function ImagePicker({ label, hint, value, onChange, shape, disabled, onProcessingChange }: Props) {
  const id = useId();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) return setError('이미지 파일을 선택해 주세요.');
    if (file.size > 10 * 1024 * 1024) return setError('10MB 이하의 이미지를 선택해 주세요.');
    setProcessing(true);
    onProcessingChange?.(true);
    try { onChange(await shrink(file)); }
    catch { setError('이미지를 읽지 못했어요. 다른 사진을 선택해 주세요.'); }
    finally { setProcessing(false); onProcessingChange?.(false); }
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
        <input id={id} aria-label={`${label} 촬영`} disabled={disabled || processing} type="file" accept="image/*" capture={shape === 'face' ? 'user' : 'environment'} className="sr-only" onChange={onFile} />
      </label>
      <p className="text-center text-caption text-ink-2">{processing ? '사진을 준비하고 있어요…' : '사진 영역을 눌러 촬영해 주세요.'}</p>
      <label className="self-center cursor-pointer rounded-full bg-surface px-4 py-3 text-label text-ink-2 focus-within:ring-2 focus-within:ring-lavender">
        이미지 업로드 (테스트용)
        <input aria-label={`${label} 이미지 업로드 (테스트용)`} disabled={disabled || processing} type="file" accept="image/*" className="sr-only" onChange={onFile} />
      </label>
      <p className="text-center text-caption text-ink-3">JPG·PNG 등 이미지, 최대 10MB</p>
      {error && <p role="alert" className="text-center text-caption text-danger">{error}</p>}
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
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이미지 변환 실패');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    // 서버 계약: JPEG의 디코딩 크기는 300KB 이하. 복잡한 사진도 품질을 낮춰 맞춘다.
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (Math.floor(dataUrl.split(',')[1].length * 3 / 4) <= 300_000) return dataUrl;
    }
    throw new Error('이미지 용량 초과');
  } finally {
    URL.revokeObjectURL(url);
  }
}
