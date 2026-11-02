import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, FileSpreadsheet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdmin } from '@/app/AdminLayout';
import { useEventId } from '@/app/AuthProvider';
import { formatDateTime } from '@/app/format';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListItem } from '@/components/ListItem';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { getRoster, importRoster } from '@/lib/api';
import type { RosterEntry } from '@/types';

type Roster = { sheetUrl: string; importedAt: number; entries: RosterEntry[] };

/** 학생회가 쓰던 구글 시트 명단 불러오기 (기술 설계 2.5) */
export function RosterPage() {
  const eventId = useEventId();
  const { event } = useAdmin();
  const [roster, setRoster] = useState<Roster | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    getRoster(eventId).then(setRoster).catch(() => setError(true));
  }, [eventId]);
  useEffect(load, [load]);

  const onImport = async (e: FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setUrlError(null);
    try {
      setRoster(await importRoster(eventId, url));
      setUrl('');
    } catch {
      setUrlError('구글 시트 주소를 확인해 주세요 (https://docs.google.com/spreadsheets/...)');
    } finally {
      setImporting(false);
    }
  };

  const requireRoster = event?.settings.requireRoster ?? false;

  return (
    <>
      <PageTitle title="명단 연동" description="학생회가 쓰던 구글 시트 명단을 불러와요. 명단에 있는 학생만 발급받게 할 수도 있어요" />
      <Card className="mb-6 flex flex-col gap-4">
        <form onSubmit={onImport} className="flex flex-col gap-3 md:flex-row md:items-end">
          <TextField
            className="flex-1"
            label="구글 시트 주소"
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            error={urlError ?? undefined}
            hint="열 순서: 학교 이메일, 이름, 학번 · 첫 줄은 제목"
          />
          <Button
            type="submit"
            size="sm"
            loading={importing}
            disabled={!url.trim()}
            icon={<FileSpreadsheet size={16} strokeWidth={1.75} />}
            className="md:mb-[25px]"
          >
            불러오기
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-4 py-3">
          <span className="flex items-center gap-2 text-label text-ink-2">
            명단에 있는 학생만 발급
            <Badge tone={requireRoster ? 'success' : 'muted'}>{requireRoster ? '켜짐' : '꺼짐'}</Badge>
          </span>
          <Link to="/admin/settings" className="flex items-center gap-1 text-label text-ink-2">
            행사 설정에서 바꾸기
            <ArrowRight size={14} strokeWidth={1.75} />
          </Link>
        </div>
      </Card>

      {error ? (
        <StateView
          kind="error"
          title="명단을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : roster === undefined ? (
        <StateView kind="loading" />
      ) : roster === null ? (
        <StateView kind="empty" title="아직 불러온 명단이 없어요" description="시트 주소를 넣고 불러오면 여기에 보여요" />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-label text-ink-2">
            {roster.entries.length}명 · {formatDateTime(roster.importedAt)}에 불러옴
          </p>
          <ResponsiveTable
            rows={roster.entries}
            rowKey={(r) => r.email}
            columns={[
              { header: '이름', cell: (r) => r.name },
              { header: '학번', cell: (r) => <span className="text-ink-2 tabular">{r.studentId}</span> },
              { header: '학교 이메일', cell: (r) => <span className="text-ink-2">{r.email}</span> },
            ]}
            mobile={(r) => <ListItem title={r.name} subtitle={`${r.studentId} · ${r.email}`} />}
          />
        </div>
      )}
      <div className="mt-6">
        <NextStepNote>
          실제 연동은 다음 단계예요. 시트를 SafePass 서비스 계정에 보기 권한으로 공유하면 불러올 수 있어요. 지금은 학교의
          테스트 학생으로 만든 예시 명단이 나와요.
        </NextStepNote>
      </div>
    </>
  );
}
