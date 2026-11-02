import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useAdmin } from '@/app/AdminLayout';
import { formatAgo } from '@/app/format';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListItem } from '@/components/ListItem';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StateView } from '@/components/StateView';
import { listDeviceResets, resolveDeviceReset } from '@/lib/api';
import type { DeviceResetRequest } from '@/types';

/** 폰을 바꾼 학생의 기기 초기화 요청 (기술 설계 2.2 resetDevice) */
export function DevicesPage() {
  const { refreshBadges } = useAdmin();
  const [rows, setRows] = useState<DeviceResetRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
            { header: '이전 기기', cell: (r) => <span className="text-ink-2">{r.deviceName}</span> },
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
