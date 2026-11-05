import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { studentGatePath } from '@/app/config';
import { formatAgo } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { NextStepNote } from '@/components/NextStepNote';
import { Orb } from '@/components/Orb';
import { getMyDeviceReset, requestDeviceReset, USE_MOCK } from '@/lib/api';
import type { DeviceResetRequest } from '@/types';

/** 다른 기기에 이미 등록된 계정 (기술 설계 2.2). 학생회 초기화 요청 */
export function DevicePage() {
  const { user, refreshUser, signOut } = useAuth();
  const [request, setRequest] = useState<DeviceResetRequest | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMyDeviceReset().then(setRequest).catch(() => setRequest(null));
  }, []);

  if (!user) return null;
  const gate = studentGatePath(user);
  if (gate !== '/device') return <Navigate to={gate ?? '/events'} replace />;

  const onRequest = async () => {
    setBusy(true);
    setError(false);
    try {
      setRequest(await requestDeviceReset());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async () => {
    setBusy(true);
    try {
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader
        title="기기 확인"
        right={
          <Button variant="ghost" size="sm" onClick={signOut}>
            로그아웃
          </Button>
        }
      />
      <main className="flex flex-col items-center gap-6 px-5 pb-6 pt-8 text-center">
        <Orb size={140} tone="warm">
          <Smartphone size={36} strokeWidth={1.75} className="text-ink" />
        </Orb>
        <div className="flex flex-col gap-2">
          <h2 className="text-title text-ink">다른 기기에 이미 등록돼 있어요</h2>
          <p className="text-body text-ink-2">
            입장권은 처음 등록한 기기에서만 열려요. 계정을 빌려줘도 다른 폰에서는 입장할 수 없게 하기 위해서예요.
          </p>
        </div>
        {USE_MOCK ? (
          <div className="w-full rounded-lg border border-line p-4 text-left">
            <p className="text-caption text-ink-2">등록된 기기</p>
            <p className="text-body text-ink">{user.deviceName ?? '알 수 없는 기기'}</p>
          </div>
        ) : (
          <p className="w-full rounded-md bg-surface px-4 py-3 text-left text-label text-ink-2">
            폰을 바꿨다면 아래 버튼으로 초기화를 요청하고, 학생회에 학생증을 보여 주세요. 초기화되면 이 폰이 새 기기로
            등록돼요.
          </p>
        )}
        {request && (
          <p className="w-full rounded-md bg-warning-bg px-4 py-3 text-label text-warning">
            {formatAgo(request.requestedAt)} 초기화를 요청했어요. 학생회가 확인하면 이 기기로 다시 등록돼요
          </p>
        )}
        {USE_MOCK && <NextStepNote>기기 서명 QR은 다음 단계에서 적용돼요. 지금은 화면 흐름만 볼 수 있어요.</NextStepNote>}
      </main>
      <BottomBar>
        {error && <p role="alert" className="text-center text-caption text-danger">요청하지 못했어요. 다시 시도해 주세요</p>}
        {request ? (
          <Button variant="secondary" loading={busy} onClick={onCheck}>
            초기화됐는지 확인하기
          </Button>
        ) : (
          <Button loading={busy} disabled={request === undefined} onClick={onRequest}>
            폰을 바꿨어요, 초기화 요청하기
          </Button>
        )}
      </BottomBar>
    </>
  );
}
