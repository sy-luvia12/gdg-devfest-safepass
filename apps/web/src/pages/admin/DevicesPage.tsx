import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RotateCcw } from '@/components/icons';
import { useAdmin } from '@/app/AdminLayout';
import { useAuth } from '@/app/AuthProvider';
import { formatAgo } from '@/app/format';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ListItem } from '@/components/ListItem';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StateView } from '@/components/StateView';
import { listDeviceResets, resetDeviceByEmail, resolveDeviceReset, USE_MOCK } from '@/lib/api';
import { ApiError } from '@/types';
import type { DeviceResetRequest } from '@/types';

/** 폰을 바꾼 학생의 기기 초기화 요청 (기술 설계 2.2 resetDevice) */
export function DevicesPage() {
  const { refreshBadges } = useAdmin();
  const { school } = useAuth();
  const [rows, setRows] = useState<DeviceResetRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onResetByEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const name = await resetDeviceByEmail(email);
      setResetMsg({ ok: true, text: `${name}님의 기기 등록을 지웠어요. 다음에 로그인한 폰이 새 기기로 등록돼요` });
      setEmail('');
      load();
      refreshBadges();
    } catch (err) {
      setResetMsg({
        ok: false,
        text: err instanceof ApiError && err.code === 'not_found' ? '이 이메일로 가입한 학생이 없어요' : '초기화하지 못했어요. 다시 시도해 주세요',
      });
    } finally {
      setResetting(false);
    }
  };

  const load = useCallback(() => {
    setError(false);
    listDeviceResets().then(setRows).catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const onReset = async (id: string) => {
    setBusyId(id);
    try {
      await resolveDeviceReset(id);
      load();
      refreshBadges();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  const action = (r: DeviceResetRequest) =>
    r.status === 'pending' ? (
      <Button
        variant="secondary"
        size="sm"
        loading={busyId === r.id}
        icon={<RotateCcw size={16} strokeWidth={1.75} />}
        onClick={() => onReset(r.id)}
      >
        초기화
      </Button>
    ) : (
      <Badge tone="muted">처리함</Badge>
    );

  return (
    <>
      <PageTitle
        title="기기 초기화"
        description="입장권은 처음 등록한 폰에서만 열려요. 폰을 바꾼 학생이 요청하면 본인인지 확인하고 초기화해 주세요"
      />
      <Card className="mb-6 flex flex-col gap-3">
        <p className="text-heading text-ink">학생 이메일로 초기화</p>
        <p className="text-caption text-ink-2">학생증으로 본인인지 확인한 뒤, 학생의 학교 이메일을 입력해 주세요</p>
        <form onSubmit={onResetByEmail} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`학번@${school?.domain ?? 'univ.ac.kr'}`}
            aria-label="학생 이메일"
            className="h-10 min-w-0 flex-1 rounded-md bg-surface px-4 text-label text-ink outline-none placeholder:text-ink-3 focus:bg-bg focus:ring-[1.5px] focus:ring-lavender"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={resetting}
            disabled={!email.trim()}
            icon={<RotateCcw size={16} strokeWidth={1.75} />}
          >
            초기화
          </Button>
        </form>
        {resetMsg && (
          <p role="status" className={resetMsg.ok ? 'text-caption text-success' : 'text-caption text-danger'}>
            {resetMsg.text}
          </p>
        )}
      </Card>
      {error ? (
        <StateView
          kind="error"
          title="요청을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !rows ? (
        <StateView kind="loading" />
      ) : (
        <ResponsiveTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="초기화 요청이 없어요"
          columns={[
            { header: '이름', cell: (r) => r.userName },
            { header: '학번', cell: (r) => <span className="text-ink-2 tabular">{r.studentId}</span> },
            { header: USE_MOCK ? '이전 기기' : '계정', cell: (r) => <span className="text-ink-2">{r.deviceName}</span> },
            { header: '요청', cell: (r) => <span className="text-caption text-ink-3">{formatAgo(r.requestedAt)}</span> },
            { header: '', className: 'text-right', cell: action },
          ]}
          mobile={(r) => (
            <ListItem
              title={`${r.userName} · ${r.studentId}`}
              subtitle={`${r.deviceName} · ${formatAgo(r.requestedAt)}`}
              trailing={action(r)}
            />
          )}
        />
      )}
      <div className="mt-6">
        <NextStepNote>
          초기화하면 학생이 다음에 로그인한 폰이 새 기기로 등록돼요. 계정 대여를 막기 위해 학생증을 직접 확인한 뒤 처리하는
          것을 권해요.
        </NextStepNote>
      </div>
    </>
  );
}
