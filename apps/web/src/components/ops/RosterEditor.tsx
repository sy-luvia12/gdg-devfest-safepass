import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Download, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { formatDateTime } from '@/app/format';
import { opsEditRoster, opsListRoster } from '@/lib/api';
import type { OpsEditResult, OpsRoster, OpsRosterKind, OpsRosterRow, RosterSkipReason } from '@/types';
import { downloadCsv, emptyDraft, parsePasted, type Draft } from './rosterText';
import { OpsBadge, OpsButton, OpsInput, OpsNotice, OpsPanel, OpsState } from './ui';

const SKIP_LABELS: Record<RosterSkipReason, string> = {
  MISSING_FIELD: '빈 칸',
  BAD_STUDENT_ID: '학번 형식',
  BAD_DOMAIN: '학교 메일 도메인 아님',
  DUPLICATE_STUDENT_ID: '학번 중복',
  DUPLICATE_EMAIL: '메일 중복',
  NOT_IN_STUDENT_ROSTER: '재학생 명단에 없음',
  NAME_MISMATCH: '이름 다름',
};

type Props = {
  kind: OpsRosterKind;
  /** schoolId (재학생 명단) 또는 eventId (행사 명단) */
  id: string;
  /** CSV 파일 이름에 쓴다 */
  label: string;
};

/** 서버에 저장된 명단을 바로 고친다: 줄 추가·수정·삭제, 시트에서 붙여넣기, CSV 내려받기 */
export function RosterEditor({ kind, id, label }: Props) {
  const withEmail = kind === 'school';
  const [data, setData] = useState<OpsRoster | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{ original: string; draft: Draft } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const load = useCallback(() => {
    setError(false);
    opsListRoster(kind, id)
      .then(setData)
      .catch(() => setError(true));
  }, [kind, id]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.rows;
    return data.rows.filter((r) => [r.name, r.studentId, r.email ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [data, query]);

  const report = (r: OpsEditResult, inputs: Draft[]) => {
    const parts = [];
    if (r.saved) parts.push(`${r.saved}줄 저장`);
    if (r.deleted) parts.push(`${r.deleted}줄 삭제`);
    if (r.skipped.length) {
      const first = r.skipped
        .slice(0, 3)
        .map((s) => `${inputs[s.index]?.studentId || `${s.index + 1}번째 줄`} ${SKIP_LABELS[s.reason]}`)
        .join(', ');
      parts.push(`건너뜀 ${r.skipped.length}줄 (${first}${r.skipped.length > 3 ? ' 외' : ''})`);
    }
    setNotice({ tone: r.skipped.length && !r.saved && !r.deleted ? 'bad' : 'ok', text: parts.join(' · ') || '바뀐 줄이 없어요' });
  };

  const run = async (key: string, inputs: Draft[], deletes: string[], replace = false) => {
    setBusy(key);
    setNotice(null);
    try {
      const upserts = inputs.map((d) => (withEmail ? d : { name: d.name, studentId: d.studentId }));
      const r = await opsEditRoster(kind, id, { upserts, deletes, replace });
      report(r, inputs);
      load();
      return r;
    } catch {
      setNotice({ tone: 'bad', text: '저장하지 못했어요. 다시 시도해 주세요' });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const onAdd = async () => {
    const r = await run('add', [draft], []);
    if (r && r.skipped.length === 0) {
      setDraft(emptyDraft);
      setAdding(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    const moved = editing.draft.studentId.trim() !== editing.original;
    const r = await run(`edit-${editing.original}`, [editing.draft], moved ? [editing.original] : []);
    if (r && r.skipped.length === 0) setEditing(null);
  };

  const onDelete = async (row: OpsRosterRow) => {
    if (!confirm(`${row.name} (${row.studentId}) 줄을 지울까요?`)) return;
    await run(`del-${row.studentId}`, [], [row.studentId]);
  };

  const onPaste = async (replace: boolean) => {
    const inputs = parsePasted(pasted, withEmail);
    if (inputs.length === 0) return setNotice({ tone: 'bad', text: '붙여 넣은 줄이 없어요' });
    if (replace && !confirm(`지금 명단을 붙여 넣은 ${inputs.length}줄로 모두 바꿀까요? 여기에 없는 줄은 지워져요`)) return;
    const r = await run(replace ? 'replace' : 'paste', inputs, [], replace);
    if (r) {
      setPasted('');
      setPasteOpen(false);
    }
  };

  if (error) {
    return (
      <OpsPanel>
        <OpsState kind="error" title="명단을 불러오지 못했어요" action={<OpsButton onClick={load}>다시 시도</OpsButton>} />
      </OpsPanel>
    );
  }
  if (!data) {
    return (
      <OpsPanel>
        <OpsState kind="loading" />
      </OpsPanel>
    );
  }

  const mismatched = kind === 'event' ? data.rows.filter((r) => r.match !== 'OK').length : 0;
  const claimed = kind === 'school' ? data.rows.filter((r) => r.claimed).length : 0;
  const draftField = (d: Draft, set: (d: Draft) => void, key: keyof Draft, placeholder: string, className: string) => (
    <OpsInput
      aria-label={placeholder}
      placeholder={placeholder}
      value={d[key]}
      onChange={(e) => set({ ...d, [key]: e.target.value })}
      className={className}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ops-ink-2">
        <span className="text-ops-ink">{data.rows.length}명</span>
        {kind === 'school' && <span>가입 {claimed}명</span>}
        {kind === 'event' && mismatched > 0 && <span className="text-ops-warn">재학생 명단과 안 맞는 줄 {mismatched}개</span>}
        {data.summary?.importedAt ? <span>마지막 변경 {formatDateTime(data.summary.importedAt)}</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-ink-3" />
          <OpsInput
            aria-label="명단 검색"
            placeholder={withEmail ? '이름, 학번, 메일 검색' : '이름, 학번 검색'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9"
          />
        </div>
        <OpsButton icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setAdding((v) => !v)}>
          줄 추가
        </OpsButton>
        <OpsButton icon={<ClipboardPaste size={15} strokeWidth={1.75} />} onClick={() => setPasteOpen((v) => !v)}>
          시트에서 붙여넣기
        </OpsButton>
        <OpsButton
          icon={<Download size={15} strokeWidth={1.75} />}
          disabled={data.rows.length === 0}
          onClick={() => downloadCsv(`${label}.csv`, data.rows, withEmail)}
        >
          CSV
        </OpsButton>
      </div>

      {notice && <OpsNotice tone={notice.tone}>{notice.text}</OpsNotice>}

      {pasteOpen && (
        <OpsPanel className="flex flex-col gap-3 p-4">
          <p className="text-label text-ops-ink-2">
            구글 시트에서 줄을 복사해 붙여 넣어요. 첫 줄에 {withEmail ? '이름·학번·이메일' : '이름·학번'} 제목이 있으면 그 순서를
            따르고, 없으면 {withEmail ? '이름, 학번, 이메일' : '이름, 학번'} 순서로 읽어요.
            {!withEmail && ' 메일은 재학생 명단에서 찾아요.'}
          </p>
          <textarea
            aria-label="붙여 넣을 명단"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder={withEmail ? '이름\t학번\t이메일\n김하늘\t2024000001\tsky@korea.ac.kr' : '이름\t학번\n김하늘\t2024000001'}
            className="rounded-md border border-ops-line bg-ops-bg p-3 font-mono text-label text-ops-ink outline-none placeholder:text-ops-ink-3 focus:border-ops-accent"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <OpsButton variant="ghost" onClick={() => setPasteOpen(false)}>
              닫기
            </OpsButton>
            <OpsButton variant="danger" loading={busy === 'replace'} disabled={!!busy && busy !== 'replace'} onClick={() => onPaste(true)}>
              전체 바꾸기
            </OpsButton>
            <OpsButton variant="primary" loading={busy === 'paste'} disabled={!!busy && busy !== 'paste'} onClick={() => onPaste(false)}>
              추가·덮어쓰기
            </OpsButton>
          </div>
        </OpsPanel>
      )}

      {adding && (
        <OpsPanel className="flex flex-wrap items-center gap-2 p-3">
          {draftField(draft, setDraft, 'name', '이름', 'w-32')}
          {draftField(draft, setDraft, 'studentId', '학번', 'w-36 tabular')}
          {withEmail && draftField(draft, setDraft, 'email', '학교 메일', 'min-w-[220px] flex-1')}
          <div className="ml-auto flex gap-2">
            <OpsButton variant="ghost" onClick={() => setAdding(false)}>
              취소
            </OpsButton>
            <OpsButton variant="primary" loading={busy === 'add'} onClick={onAdd}>
              추가
            </OpsButton>
          </div>
        </OpsPanel>
      )}

      <OpsPanel className="overflow-hidden">
        {rows.length === 0 ? (
          <OpsState kind="empty" title={query ? '검색 결과가 없어요' : '명단이 비어 있어요. 줄을 추가하거나 시트에서 붙여 넣어요'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="border-b border-ops-line text-left text-caption text-ops-ink-3">
                  <th className="px-4 py-2.5 font-medium">학번</th>
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">{withEmail ? '학교 메일' : '재학생 명단 대조'}</th>
                  <th className="px-4 py-2.5 font-medium">{withEmail ? '가입' : '학교 메일 (운영진만)'}</th>
                  <th className="w-px px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  editing?.original === r.studentId ? (
                    <tr key={r.studentId} className="border-b border-ops-line bg-ops-raised last:border-0">
                      <td className="px-3 py-2">
                        {draftField(editing.draft, (d) => setEditing({ ...editing, draft: d }), 'studentId', '학번', 'w-32 tabular')}
                      </td>
                      <td className="px-3 py-2">
                        {draftField(editing.draft, (d) => setEditing({ ...editing, draft: d }), 'name', '이름', 'w-28')}
                      </td>
                      <td className="px-3 py-2" colSpan={2}>
                        {withEmail ? (
                          draftField(editing.draft, (d) => setEditing({ ...editing, draft: d }), 'email', '학교 메일', 'w-full min-w-[200px]')
                        ) : (
                          <span className="text-caption text-ops-ink-3">저장하면 재학생 명단과 다시 대조해요</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <OpsButton variant="ghost" aria-label="수정 취소" icon={<X size={15} strokeWidth={1.75} />} onClick={() => setEditing(null)} />
                          <OpsButton variant="primary" loading={busy === `edit-${r.studentId}`} onClick={onSaveEdit}>
                            저장
                          </OpsButton>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.studentId} className="border-b border-ops-line last:border-0 hover:bg-ops-raised/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-ops-ink-2 tabular">{r.studentId}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ops-ink">{r.name}</td>
                      <td className="px-4 py-2.5 text-ops-ink-2">
                        {withEmail ? (
                          r.email
                        ) : r.match === 'OK' ? (
                          <OpsBadge tone="ok">맞음</OpsBadge>
                        ) : (
                          <OpsBadge tone="warn">{SKIP_LABELS[r.match ?? 'NOT_IN_STUDENT_ROSTER']}</OpsBadge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ops-ink-3">
                        {withEmail ? (
                          r.claimed ? <OpsBadge tone="accent">가입함</OpsBadge> : <span>-</span>
                        ) : (
                          (r.email ?? '-')
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <OpsButton
                            variant="ghost"
                            aria-label={`${r.name} 수정`}
                            icon={<Pencil size={15} strokeWidth={1.75} />}
                            onClick={() =>
                              setEditing({ original: r.studentId, draft: { name: r.name, studentId: r.studentId, email: r.email ?? '' } })
                            }
                          />
                          <OpsButton
                            variant="danger"
                            aria-label={`${r.name} 삭제`}
                            loading={busy === `del-${r.studentId}`}
                            icon={<Trash2 size={15} strokeWidth={1.75} />}
                            onClick={() => onDelete(r)}
                          />
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </OpsPanel>
    </div>
  );
}
