import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus } from '@/components/icons';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListItem } from '@/components/ListItem';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { addStaff, listStaff, removeStaff, USE_MOCK } from '@/lib/api';
import type { User } from '@/types';

/** 검표 권한 관리. 같은 학교 계정만 스태프로 지정할 수 있다 */
export function StaffPage() {
  const { school } = useAuth();
  const [rows, setRows] = useState<User[] | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    listStaff().then(setRows).catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await addStaff(email);
      setEmail('');
      load();
    } catch {
      setAddError(USE_MOCK ? `${school?.name} 학교 계정을 찾지 못했어요. 한 번 이상 로그인한 학생만 추가할 수 있어요` : '추가하지 못했어요. 이메일을 확인해 주세요');
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (uid: string) => {
    setBusyUid(uid);
    try {
      await removeStaff(uid);
      load();
    } finally {
      setBusyUid(null);
    }
  };

  const roleBadge = (u: User) => <Badge tone={u.role === 'admin' ? 'neutral' : 'success'}>{u.role === 'admin' ? '학생회' : '스태프'}</Badge>;
  const action = (u: User) =>
    u.role === 'staff' ? (
      <Button variant="ghost" size="sm" loading={busyUid === u.uid} onClick={() => onRemove(u.uid)}>
        권한 해제
      </Button>
    ) : null;

  return (
    <>
      <PageTitle title="스태프 관리" description="검표 화면을 쓸 수 있는 사람을 정해요. 학생회는 모든 화면을 쓸 수 있어요" />
      <Card className="mb-6">
        <form onSubmit={onAdd} className="flex flex-col gap-3 md:flex-row md:items-end">
          <TextField
            className="flex-1"
            label="스태프로 추가할 구글 계정 이메일"
            type="email"
            placeholder={USE_MOCK ? `name@${school?.domain ?? 'univ.ac.kr'}` : 'name@gmail.com'}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setAddError(null);
            }}
            error={addError ?? undefined}
          />
          <Button type="submit" size="sm" loading={adding} disabled={!email.trim()} icon={<UserPlus size={16} strokeWidth={1.75} />} className="md:mb-[5px]">
            추가
          </Button>
        </form>
        {!USE_MOCK && (
          <p className="mt-2 text-caption text-ink-2">아직 로그인하지 않은 사람도 추가할 수 있어요. 처음 로그인할 때 스태프가 돼요</p>
        )}
      </Card>
      {error ? (
        <StateView
          kind="error"
          title="스태프 목록을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !rows ? (
        <StateView kind="loading" />
      ) : (
        <ResponsiveTable
          rows={rows}
          rowKey={(u) => u.uid}
          columns={[
            {
              header: '이름',
              cell: (u) => (
                <span className="flex items-center gap-3">
                  <Avatar src={u.photoUrl} alt={u.name} size={32} />
                  {u.name}
                </span>
              ),
            },
            { header: '이메일', cell: (u) => <span className="text-ink-2">{u.email}</span> },
            { header: '역할', cell: roleBadge },
            { header: '', className: 'text-right', cell: (u) => action(u) },
          ]}
          mobile={(u) => (
            <ListItem
              leading={<Avatar src={u.photoUrl} alt={u.name} size={40} />}
              title={u.name}
              subtitle={u.email}
              trailing={action(u) ?? roleBadge(u)}
            />
          )}
        />
      )}
    </>
  );
}
