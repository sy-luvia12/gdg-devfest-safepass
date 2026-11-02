import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, CameraOff, CheckCircle2, ClipboardList, ImageOff, Keyboard, Sun, UserCheck, UserRound } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { useAuth, useEventId } from '@/app/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { ResultSheet, type SheetState } from '@/components/ResultSheet';
import { ScanFrame } from '@/components/ScanFrame';
import { StateView } from '@/components/StateView';
import { confirmEntry, subscribeStaffStats, verifyEntry } from '@/lib/api';
import type { StaffStats } from '@/types';

const READER_ID = 'qr-reader';
type CameraState = 'starting' | 'on' | 'error';

export function ScanPage() {
  const navigate = useNavigate();
  const eventId = useEventId();
  const { user } = useAuth();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');

  const check = useCallback(async (payload: string) => {
    // 결과 시트가 떠 있거나 확인 중이면 같은 QR을 다시 처리하지 않는다
    if (busyRef.current) return;
    busyRef.current = true;
    pauseScanner(scannerRef.current);
    setVerifying(true);
    setVerifyError(false);
    try {
      const r = await verifyEntry(payload);
      setSheet(
        r.needsConfirm && r.user && r.ticketId
          ? { step: 'confirm', ticketId: r.ticketId, user: r.user, nftTokenId: r.nftTokenId }
          : { step: 'done', result: r.result, user: r.user, nftTokenId: r.nftTokenId, usedAt: r.usedAt },
      );
    } catch {
      setVerifyError(true);
      busyRef.current = false;
      resumeScanner(scannerRef.current);
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    scannerRef.current = scanner;
    let disposed = false;
    const started = scanner
      .start({ facingMode: 'environment' }, { fps: 10 }, (text) => void check(text), () => {})
      .then(() => {
        if (disposed) return;
        setCamera('on');
      })
      .catch(() => {
        if (!disposed) setCamera('error');
      });
    return () => {
      disposed = true;
      scannerRef.current = null;
      void started.then(() => {
        if (scanner.isScanning) return scanner.stop().then(() => scanner.clear());
      }).catch(() => {});
    };
  }, [check]);

  useEffect(() => subscribeStaffStats(eventId, setStats), [eventId]);

  const onConfirm = async (match: boolean) => {
    if (sheet?.step !== 'confirm') return;
    setConfirming(match);
    try {
      const { result } = await confirmEntry(sheet.ticketId, match);
      setSheet({ step: 'done', result, user: sheet.user, nftTokenId: sheet.nftTokenId });
    } catch {
      setVerifyError(true);
      onNext();
    } finally {
      setConfirming(null);
    }
  };

  const onNext = () => {
    setSheet(null);
    setManual('');
    busyRef.current = false;
    resumeScanner(scannerRef.current);
  };

  const onManual = (e: FormEvent) => {
    e.preventDefault();
    if (manual.trim()) void check(manual.trim());
  };

  const right = (
    <>
      <IconButton icon={ClipboardList} label="내 검표 기록" onClick={() => navigate('/staff/history')} />
      {user?.role === 'admin' ? (
        <IconButton icon={BarChart3} label="입장 현황" onClick={() => navigate('/admin')} />
      ) : (
        <IconButton icon={UserRound} label="내 정보" onClick={() => navigate('/me')} />
      )}
    </>
  );

  return (
    <>
      <AppHeader title="검표" right={right} />
      <main className="flex flex-col gap-5 px-5 pb-10 pt-2">
        <div className="grid grid-cols-2 divide-x divide-line rounded-lg border border-line">
          <div className="flex flex-col items-center gap-0.5 py-3">
            <span className="text-caption text-ink-2">전체 입장</span>
            <span key={stats?.enteredCount} className="text-heading text-ink tabular animate-rise-in">
              {stats ? `${stats.enteredCount.toLocaleString('ko-KR')} / ${stats.capacity.toLocaleString('ko-KR')}` : '-'}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 py-3">
            <span className="text-caption text-ink-2">내가 입장 처리</span>
            <span key={stats?.myCount} className="text-heading text-ink tabular animate-rise-in">
              {stats ? `${stats.myCount}명` : '-'}
            </span>
          </div>
        </div>
        <p className="flex items-center justify-center gap-2 text-body text-ink">
          <CheckCircle2 size={20} strokeWidth={1.75} className="text-success" />
          QR을 프레임 안에 맞춰주세요
        </p>

        <ScanFrame>
          <div id={READER_ID} className="h-full w-full" />
          {camera !== 'on' && (
            <div className="absolute inset-0 flex items-center justify-center">
              {camera === 'starting' ? (
                <StateView kind="loading" title="카메라를 켜는 중이에요" />
              ) : (
                <div className="flex flex-col items-center gap-2 px-8 text-center">
                  <CameraOff size={28} strokeWidth={1.75} className="text-ink-2" />
                  <p className="text-heading text-ink">카메라를 사용할 수 없어요</p>
                  <p className="text-caption text-ink-2">
                    카메라 권한을 허용했는지 확인해 주세요. 카메라는 https 주소에서만 동작해요
                  </p>
                </div>
              )}
            </div>
          )}
          {verifying && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <StateView kind="loading" title="확인 중이에요" />
            </div>
          )}
        </ScanFrame>

        {verifyError && (
          <p role="alert" className="rounded-md bg-danger-bg px-4 py-3 text-center text-label text-danger">
            확인하지 못했어요. 네트워크를 확인하고 다시 찍어 주세요
          </p>
        )}

        <ul className="flex flex-col gap-3">
          <Guide icon={Sun} text="학생에게 화면 밝기를 최대로 올려 달라고 해 주세요" />
          <Guide icon={ImageOff} text="캡처한 화면은 만료된 QR로 거부돼요" />
          <Guide icon={UserCheck} text="사진과 얼굴을 대조한 뒤에 입장 처리해 주세요" />
        </ul>

        <div className="border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className="flex items-center gap-1.5 text-caption text-ink-3"
          >
            <Keyboard size={14} strokeWidth={1.75} />
            카메라 없이 QR 내용으로 확인
          </button>
          {manualOpen && (
            <form onSubmit={onManual} className="mt-3 flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="safepass:..."
                aria-label="QR 내용"
                className="h-10 min-w-0 flex-1 rounded-md bg-surface px-4 text-label text-ink outline-none placeholder:text-ink-3 focus:bg-bg focus:ring-[1.5px] focus:ring-lavender"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={!manual.trim()}>
                확인
              </Button>
            </form>
          )}
        </div>
      </main>

      {sheet && <ResultSheet state={sheet} onNext={onNext} onConfirm={onConfirm} confirming={confirming} />}
    </>
  );
}

function pauseScanner(s: Html5Qrcode | null) {
  try {
    if (s?.isScanning) s.pause(true);
  } catch {
    // 이미 멈춘 상태
  }
}

function resumeScanner(s: Html5Qrcode | null) {
  try {
    s?.resume();
  } catch {
    // 카메라가 꺼져 있으면 무시
  }
}

function Guide({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-start gap-3 text-caption text-ink-2">
      <Icon size={16} strokeWidth={1.75} className="mt-px shrink-0" />
      {text}
    </li>
  );
}
