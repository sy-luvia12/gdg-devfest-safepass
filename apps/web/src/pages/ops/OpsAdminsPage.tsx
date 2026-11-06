import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserMinus, UserPlus } from '@/components/icons';
import { OpsBadge, OpsButton, OpsInput, OpsNotice, OpsPanel, OpsState, OpsTitle } from '@/components/ops/ui';
import { listSchools, opsListEventAdmins, opsSetEventAdmin } from '@/lib/api';
import type { OpsEventAdmin, School } from '@/types';

/** 행사 관리자 지정: 팀원의 개인 Gmail을 학교에 붙인다. 지정된 계정은 구글 로그인하면 그 학교 행사 관리 화면(/admin)으로 간다 */
export function OpsAdminsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [admins, setAdmins] = useState<OpsEventAdmin[] | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(() => {
    setError(false);
    Promise.all([listSchools(), opsListEventAdmins()])
      .then(([s, a]) => {
        setSchools(s);
        setSchoolId((cur) => cur || s[0]?.id || '');
        setAdmins(a);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name ?? id;

  const set = async (key: string, address: string, school: string | null) => {
    setBusy(key);
    setNotice(null);
    try {
      await opsSetEventAdmin(address, school);
      setNotice({
        tone: 'ok',
        text: school ? `${address}을(를) ${schoolName(school)} 행사 관리자로 지정했어요` : `${address}의 행사 관리자 권한을 뺐어요`,
      });
      if (school) setEmail('');
      load();
    } catch {
      setNotice({ tone: 'bad', text: '바꾸지 못했어요. 메일을 확인해 주세요 (운영진 계정은 바꿀 수 없어요)' });
    } finally {
      setBusy(null);
    }
  };

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim() && schoolId) void set('add', email.trim(), schoolId);
  };

  return (
    <>
      <OpsTitle
        title="행사 관리자 지정"
        description="팀원의 구글 계정(개인 Gmail 가능)을 학교에 지정해요. 그 계정으로 구글 로그인하면 그 학교 행사 관리 화면으로 들어가요"
      />
      <OpsPanel className="mb-4 p-4">
        <form onSubmit={onAdd} className="flex flex-wrap items-center gap-2">
          <OpsInput
            type="email"
            aria-label="구글 계정 메일"
            placeholder="name@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-[220px] flex-1"
          />
          <select
            aria-label="학교"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="h-9 rounded-md border border-ops-line bg-ops-bg px-3 text-label text-ops-ink outline-none focus:border-ops-accent"
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <OpsButton
            type="submit"
            variant="primary"
            loading={busy === 'add'}
            disabled={!email.trim() || !schoolId}
            icon={<UserPlus size={15} strokeWidth={1.75} />}
          >
            지정
          </OpsButton>
        </form>
        <p className="mt-3 text-caption text-ops-ink-3">
          이미 다른 학교에 지정된 계정이면 새 학교로 옮겨요. 아직 로그인 전이면 처음 구글 로그인할 때 적용돼요. "학교 없음"인
          관리자는 학교를 지정하기 전까지 관리 화면을 쓸 수 없어요
        </p>
      </OpsPanel>
      {notice && (
        <div className="mb-4">
          <OpsNotice tone={notice.tone}>{notice.text}</OpsNotice>
        </div>
      )}
      <OpsPanel className="overflow-hidden">
        {error ? (
          <OpsState kind="error" action={<OpsButton onClick={load}>다시 시도</OpsButton>} />
        ) : !admins ? (
          <OpsState kind="loading" />
        ) : admins.length === 0 ? (
          <OpsState kind="empty" title="지정된 행사 관리자가 없어요" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="border-b border-ops-line text-left text-caption text-ops-ink-3">
                  <th className="px-4 py-2.5 font-medium">학교</th>
                  <th className="px-4 py-2.5 font-medium">구글 계정</th>
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">상태</th>
                  <th className="w-px px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.email} className="border-b border-ops-line last:border-0 hover:bg-ops-raised/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ops-ink">
                      {a.schoolId ? schoolName(a.schoolId) : <OpsBadge tone="warn">학교 없음</OpsBadge>}
                    </td>
                    <td className="px-4 py-2.5 text-ops-ink-2">{a.email}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ops-ink-2">{a.pending ? '-' : a.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <OpsBadge tone={a.pending ? 'warn' : 'ok'}>{a.pending ? '로그인 전' : '로그인함'}</OpsBadge>
                    </td>
                    <td className="px-3 py-2">
                      <OpsButton
                        variant="danger"
                        loading={busy === a.email}
                        icon={<UserMinus size={15} strokeWidth={1.75} />}
                        onClick={() => {
                          if (confirm(`${a.email}의 행사 관리자 권한을 뺄까요?`)) void set(a.email, a.email, null);
                        }}
                      >
                        해제
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
