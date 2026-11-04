import { useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, ClipboardList, FileText, Info, LogOut, Shield, Smartphone, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { homePathFor } from '@/app/config';
import { Avatar } from '@/components/Avatar';
import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StateView } from '@/components/StateView';
import { getEvent } from '@/lib/api';
import type { Event, Role } from '@/types';

const ROLE: Record<Role, string> = { student: '재학생', staff: '검표 스태프', admin: '학생회' };

/** 내 정보·설정 (모든 역할) */
export function MePage() {
  const navigate = useNavigate();
  const { user, school, eventId, signOut } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    if (eventId) getEvent(eventId).then(setEvent).catch(() => {});
  }, [eventId]);

  if (!user || !school) return <StateView kind="loading" fullScreen />;

  // 행사 종료(프로토타입은 행사 날짜) + 보관 기간 뒤 삭제
  const deleteAt = event ? new Date(new Date(event.date).getTime() + event.dataRetentionDays * 86_400_000) : null;

  return (
    <>
      <AppHeader title="내 정보" back={homePathFor(user.role)} />
      <main className="flex flex-col gap-6 px-5 pb-10 pt-2">
        <section className="flex items-center gap-4">
          <Avatar src={user.photoUrl} alt={`${user.name} 사진`} size={72} />
          <div className="min-w-0">
            <p className="text-title text-ink">{user.name}</p>
            <p className="text-caption text-ink-2 tabular">
              {school.name} · {user.studentId}
            </p>
            <p className="truncate text-caption text-ink-2">{user.email}</p>
          </div>
        </section>

        <Card padded={false} className="divide-y divide-line">
          <InfoRow icon={Shield} label="역할" value={<Badge tone="neutral">{ROLE[user.role]}</Badge>} />
          <InfoRow
            icon={UserCheck}
            label="재학생 확인"
            value={
              user.verifyStatus === 'approved' ? (
                <Badge tone="success">승인됨</Badge>
              ) : user.verifyStatus === 'pending' ? (
                <Badge tone="warning">확인 중</Badge>
              ) : (
                <Badge tone="muted">미완료</Badge>
              )
            }
          />
          <InfoRow icon={Smartphone} label="등록 기기" value={<span className="text-body text-ink">{user.deviceName ?? '-'}</span>} />
        </Card>

        <section className="flex flex-col gap-2">
          <h2 className="text-label text-ink-2">개인정보 보관</h2>
          <p className="rounded-md bg-surface px-4 py-3 text-caption text-ink-2">
            사진과 입장 기록은 행사가 끝나고 {event?.dataRetentionDays ?? 7}일 뒤
            {deleteAt ? ` (${deleteAt.getMonth() + 1}월 ${deleteAt.getDate()}일)` : ''} 자동으로 삭제돼요. 블록체인에는
            입장권 번호만 남고 개인정보는 올라가지 않아요.
          </p>
        </section>

        <Card padded={false} className="divide-y divide-line">
          {user.role !== 'student' && <LinkRow to="/staff/history" icon={ClipboardList} label="내 검표 기록" />}
          <LinkRow to="/about" icon={Info} label="SafePass 소개" />
          <LinkRow to="/terms" icon={FileText} label="이용약관" />
          <LinkRow to="/privacy" icon={Shield} label="개인정보 처리방침" />
        </Card>

        <Button
          variant="secondary"
          icon={<LogOut size={18} strokeWidth={1.75} />}
          onClick={async () => {
            await signOut();
            navigate('/', { replace: true });
          }}
        >
          로그아웃
        </Button>
      </main>
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex h-14 items-center gap-3 px-5">
      <Icon size={18} strokeWidth={1.75} className="text-ink-2" />
      <span className="flex-1 text-body text-ink-2">{label}</span>
      {value}
    </div>
  );
}

function LinkRow({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="flex h-14 items-center gap-3 px-5 transition duration-200 active:bg-surface">
      <Icon size={18} strokeWidth={1.75} className="text-ink-2" />
      <span className="flex-1 text-body text-ink">{label}</span>
      <ChevronRight size={18} strokeWidth={1.75} className="text-ink-3" />
    </Link>
  );
}
