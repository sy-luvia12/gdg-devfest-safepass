import { useState, type FormEvent } from 'react';
import { Check, Copy, FileSpreadsheet } from '@/components/icons';
import { formatDateTime } from '@/app/format';
import { ApiError, type RosterEntry, type RosterImport, type RosterSkipReason, type RosterView } from '@/types';
import { Button } from './Button';
import { Card } from './Card';
import { ListItem } from './ListItem';
import { ResponsiveTable } from './ResponsiveTable';
import { TextField } from './TextField';

const SHEET_ERRORS: Partial<Record<ApiError['code'], string>> = {
  sheet_bad_url: '구글 시트 주소를 확인해 주세요 (https://docs.google.com/spreadsheets/d/...)',
  sheet_not_shared: '시트를 위 계정에 보기 권한으로 공유한 뒤 다시 불러와 주세요',
  sheet_not_found: '시트를 찾지 못했어요. 주소를 확인해 주세요',
  sheet_api_disabled: '서비스에서 구글 시트 읽기가 꺼져 있어요. Campass 운영팀에 알려 주세요',
  sheet_missing_columns: '첫 줄에 필요한 열(이름, 학번)이 있어야 해요',
  not_found: '스페이스를 먼저 만들어 주세요',
};

const SKIP_LABELS: Record<RosterSkipReason, string> = {
  MISSING_FIELD: '빈 칸',
  BAD_STUDENT_ID: '학번 형식',
  BAD_DOMAIN: '학교 메일 아님',
  DUPLICATE_STUDENT_ID: '학번 중복',
  DUPLICATE_EMAIL: '메일 중복',
  NOT_IN_STUDENT_ROSTER: '재학생 명단에 없음',
  NAME_MISMATCH: '재학생 명단과 이름 다름',
};

type Props = {
  /** 지금 불러와 있는 명단. null이면 아직 읽는 중 */
  view: RosterView | null;
  onImport: (sheetUrl: string) => Promise<RosterImport>;
  /** 불러오기가 끝난 뒤 (명단·요약 다시 읽기) */
  onImported: () => void;
  /** 행사 명단은 이름·학번만 받는다 (메일은 서버가 재학생 명단에서 찾는다) */
  kind?: 'student' | 'event' | 'waitlist';
};

/** 구글 시트 명단 불러오기: 공유할 계정 안내, 시트 주소, 불러오기 결과. 재학생 명단·행사 명단이 같이 쓴다 */
export function SheetImportCard({ view, onImport, onImported, kind = 'student' }: Props) {
  const current = view?.summary?.sheetUrl ?? '';
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RosterImport | null>(null);
  const [copied, setCopied] = useState(false);
  const target = url.trim() || current;

  const copy = async () => {
    if (!view?.serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(view.serviceAccountEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 복사가 막힌 브라우저는 주소를 직접 선택해서 복사한다
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await onImport(target));
      setUrl('');
      onImported();
    } catch (err) {
      setError((err instanceof ApiError && SHEET_ERRORS[err.code]) || '불러오지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="flex flex-col gap-5">
      <ol className="flex flex-col gap-3 text-body text-ink">
        <li className="flex flex-col gap-2">
          <span>1. 명단 시트를 아래 계정에 보기 권한(뷰어)으로 공유해요</span>
          {view?.serviceAccountEmail ? (
            <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-3">
              <code className="min-w-0 flex-1 truncate text-label text-ink-2 select-all">{view.serviceAccountEmail}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copy}
                icon={copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
              >
                {copied ? '복사함' : '복사'}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-ink-2">공유할 계정을 확인하는 중이에요</p>
          )}
        </li>
        <li>
          {kind === 'event'
            ? '2. 첫 줄에 이름, 학번 제목을 두고, 시트 주소를 붙여 넣어요. 재학생 명단과 맞는 학생만 들어가요'
            : kind === 'waitlist'
              ? '2. 첫 줄에 이름, 학번 제목을 두고 대기 순서대로 적은 뒤, 시트 주소를 붙여 넣어요. 재학생 명단과 맞는 학생만 들어가요'
              : '2. 첫 줄에 이름, 학번, 이메일 제목을 두고, 시트 주소를 붙여 넣어요'}
        </li>
      </ol>
      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
        <TextField
          className="flex-1"
          label="구글 시트 주소"
          type="url"
          placeholder={current || 'https://docs.google.com/spreadsheets/d/...'}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          hint={
            current
              ? '비워 두면 지금 시트를 다시 불러와요'
              : kind !== 'student'
                ? '재학생 명단과 맞지 않는 줄과 중복된 줄은 건너뛰어요'
                : '학교 메일이 아닌 줄과 중복된 줄은 건너뛰어요'
          }
        />
        <Button
          type="submit"
          size="sm"
          loading={importing}
          disabled={!target}
          icon={<FileSpreadsheet size={16} strokeWidth={1.75} />}
          className="md:mb-[25px]"
        >
          {current && !url.trim() ? '다시 불러오기' : '불러오기'}
        </Button>
      </form>
      {result && (
        <p className="rounded-md bg-surface px-4 py-3 text-label text-ink-2" role="status">
          {result.summary.count}명을 불러왔어요
          {result.skipped.length > 0 &&
            ` · 건너뛴 줄 ${result.skipped.length}개 (${result.skipped
              .slice(0, 5)
              .map((s) => `${s.row}행 ${SKIP_LABELS[s.reason]}`)
              .join(', ')}${result.skipped.length > 5 ? ' 외' : ''})`}
        </p>
      )}
    </Card>
  );
}

/** 불러온 명단 미리보기. 앞쪽 일부만 보여준다 */
export function RosterPreview({ view }: { view: RosterView }) {
  if (!view.summary) return null;
  const { count, importedAt } = view.summary;
  const withEmail = view.entries.some((e) => e.email);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-label text-ink-2">
        {count}명 · {formatDateTime(importedAt)}에 불러옴
        {count > view.entries.length && ` · 앞의 ${view.entries.length}명만 보여요`}
      </p>
      <ResponsiveTable<RosterEntry>
        rows={view.entries}
        rowKey={(r) => r.studentId}
        columns={[
          { header: '이름', cell: (r) => r.name },
          { header: '학번', cell: (r) => <span className="text-ink-2 tabular">{r.studentId}</span> },
          // 행사 명단에는 메일이 없다 (행사 담당자는 이름·학번만 본다)
          ...(withEmail
            ? [{ header: '학교 이메일', cell: (r: RosterEntry) => <span className="text-ink-2">{r.email}</span> }]
            : []),
        ]}
        mobile={(r) => <ListItem title={r.name} subtitle={withEmail ? `${r.studentId} · ${r.email}` : r.studentId} />}
      />
    </div>
  );
}
