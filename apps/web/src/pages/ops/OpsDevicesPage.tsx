import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search } from '@/components/icons';
import { cx } from '@/components/cx';
import { OpsBadge, OpsButton, OpsInput, OpsNotice, OpsPanel, OpsState, OpsTitle } from '@/components/ops/ui';
import { listSchools, opsListStudents, opsResetDevice } from '@/lib/api';
import type { OpsStudent, School } from '@/types';

/** 가입한 학생의 기기 등록을 학교별로 보고 바로 초기화한다 (요청이 없어도 된다) */
export function OpsDevicesPage() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [students, setStudents] = useState<OpsStudent[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    listSchools()
      .then((s) => {
        setSchools(s);
        setSchoolId((cur) => cur || s[0]?.id || '');
      })
      .catch(() => setError(true));
  }, []);

  const load = useCallback(() => {
    if (!schoolId) return;
    setError(false);
    setStudents(null);
    opsListStudents(schoolId)
      .then(setStudents)
      .catch(() => setError(true));
  }, [schoolId]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...(students ?? [])].sort((a, b) => Number(b.resetRequested) - Number(a.resetRequested));
    return q ? list.filter((s) => [s.name, s.studentId, s.email].some((v) => v.toLowerCase().includes(q))) : list;
  }, [students, query]);

  const onReset = async (s: OpsStudent) => {
    setBusy(s.uid);
    setNotice(null);
    try {
      await opsResetDevice(s.uid);
      setNotice({ tone: 'ok', text: `${s.name}님의 기기 등록을 지웠어요. 다음에 로그인한 기기가 새로 등록돼요` });
      load();
    } catch {
      setNotice({ tone: 'bad', text: '초기화하지 못했어요. 다시 시도해 주세요' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <OpsTitle title="기기 초기화" description="입장권은 처음 등록한 기기에서만 열려요. 폰을 바꾼 학생이나 테스트 계정을 여기서 풀어 줘요" />
      <div className="mb-4 flex flex-wrap gap-2">
        {(schools ?? []).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSchoolId(s.id)}
            className={cx(
              'h-9 rounded-full px-3.5 text-label transition duration-150',
              s.id === schoolId ? 'bg-ops-accent text-ops-bg' : 'bg-ops-raised text-ops-ink-2 hover:text-ops-ink',
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-ink-3" />
        <OpsInput
          aria-label="학생 검색"
          placeholder="이름, 학번, 메일 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9"
        />
      </div>
      {notice && (
        <div className="mb-4">
          <OpsNotice tone={notice.tone}>{notice.text}</OpsNotice>
        </div>
      )}
      <OpsPanel className="overflow-hidden">
        {error ? (
          <OpsState kind="error" action={<OpsButton onClick={load}>다시 시도</OpsButton>} />
        ) : !students ? (
          <OpsState kind="loading" />
        ) : rows.length === 0 ? (
          <OpsState kind="empty" title={query ? '검색 결과가 없어요' : '아직 가입한 학생이 없어요'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="border-b border-ops-line text-left text-caption text-ops-ink-3">
                  <th className="px-4 py-2.5 font-medium">학번</th>
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">메일</th>
                  <th className="px-4 py-2.5 font-medium">기기</th>
                  <th className="w-px px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.uid} className="border-b border-ops-line last:border-0 hover:bg-ops-raised/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ops-ink-2 tabular">{s.studentId || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ops-ink">{s.name}</td>
                    <td className="px-4 py-2.5 text-ops-ink-2">{s.email}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <OpsBadge tone={s.deviceRegistered ? 'accent' : 'muted'}>{s.deviceRegistered ? '등록됨' : '없음'}</OpsBadge>
                        {s.resetRequested && <OpsBadge tone="warn">초기화 요청</OpsBadge>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <OpsButton
                        icon={<RotateCcw size={15} strokeWidth={1.75} />}
                        loading={busy === s.uid}
                        disabled={!s.deviceRegistered && !s.resetRequested}
                        onClick={() => onReset(s)}
                      >
                        초기화
                      </OpsButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsPanel>
    </>
  );
}
