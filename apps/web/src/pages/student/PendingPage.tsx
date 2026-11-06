import { useState } from 'react';
import { Clock } from '@/components/icons';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { studentGatePath } from '@/app/config';
import { formatAgo } from '@/app/format';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { Orb } from '@/components/Orb';

/** 학생회 승인 대기. 승인되면 축제 화면, 반려되면 온보딩으로 */
export function PendingPage() {
  const { user, refreshUser, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  if (!user) return null;
  const gate = studentGatePath(user);
  if (gate !== '/onboarding/pending') return <Navigate to={gate ?? '/events'} replace />;

  const onCheck = async () => {
    setChecking(true);
    try {
      await refreshUser();
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <AppHeader
        title="재학생 확인"
        right={
          <Button variant="ghost" size="sm" onClick={signOut}>
            로그아웃
          </Button>
        }
      />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-6 text-center">
        <Orb size={160}>
          <Clock size={36} strokeWidth={1.75} className="text-ink" />
        </Orb>
        <div className="flex flex-col gap-2">
          <h2 className="text-display text-ink">학생회가 확인하고 있어요</h2>
          <p className="text-body text-ink-2">학생증과 본인 사진을 비교해 재학생인지 확인해요</p>
          {user.submittedAt && (
            <p className="text-caption text-ink-3">{formatAgo(user.submittedAt)}에 요청했어요</p>
          )}
        </div>
        <ul className="w-full max-w-[320px] rounded-lg bg-surface p-4 text-left text-caption text-ink-2">
          <li>· 승인되면 바로 입장권을 받을 수 있어요</li>
          <li>· 사진이 흐리면 반려될 수 있어요. 반려 사유를 보고 다시 보내면 돼요</li>
        </ul>
      </main>
      <BottomBar>
        <Button variant="secondary" loading={checking} onClick={onCheck}>
          승인됐는지 확인하기
        </Button>
      </BottomBar>
    </>
  );
}
