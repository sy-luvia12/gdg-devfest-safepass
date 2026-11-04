import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAdmin } from '@/app/AdminLayout';
import { formatAgo } from '@/app/format';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { cx } from '@/components/cx';
import { FilterChips } from '@/components/FilterChips';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { StateView } from '@/components/StateView';
import { listPendingVerifications, reviewVerification } from '@/lib/api';
import type { User } from '@/types';

const REASONS = ['사진이 흐려요', '학생증 정보가 계정과 달라요', '사진과 학생증 얼굴이 달라요'] as const;

/** 재학생 승인: 학생증과 본인 사진을 나란히 보고 승인·반려 (기술 설계 2.3) */
export function ApprovalsPage() {
  const { refreshBadges } = useAdmin();
  const [list, setList] = useState<User[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    listPendingVerifications()
      .then((l) => {
        setList(l);
        setSelected((cur) => (cur && l.some((u) => u.uid === cur) ? cur : (l[0]?.uid ?? null)));
      })
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const current = list?.find((u) => u.uid === selected) ?? null;

  const review = async (approve: boolean) => {
    if (!current) return;
    setBusy(true);
    try {
      await reviewVerification(current.uid, approve, approve ? undefined : reason);
      setDone(`${current.name}님을 ${approve ? '승인' : '반려'}했어요`);
      setRejecting(false);
      load();
      refreshBadges();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="재학생 승인" description="이전 대기 요청만 표시돼요. 새 인증은 학적 명단과 대조해 자동 처리돼요" />
      {error ? (
        <StateView
          kind="error"
          title="승인 요청을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : !list ? (
        <StateView kind="loading" />
      ) : list.length === 0 ? (
        <>
          {done && <p className="mb-4 text-center text-label text-success">{done}</p>}
          <StateView kind="empty" title="확인할 요청이 없어요" description="새 요청이 오면 메뉴에 숫자가 표시돼요" />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-2 lg:col-span-4">
            <p className="text-label text-ink-2">대기 {list.length}건 · 먼저 온 순서</p>
            {list.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => {
                  setSelected(u.uid);
                  setRejecting(false);
                  setDone(null);
                }}
                className={cx(
                  'flex items-center gap-3 rounded-md border p-3 text-left transition duration-200',
                  u.uid === selected ? 'border-lavender bg-lavender/30' : 'border-line hover:bg-surface',
                )}
              >
                <Avatar src={u.photoUrl} alt={`${u.name} 사진`} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-ink">{u.name}</span>
                  <span className="block text-caption text-ink-2 tabular">{u.studentId}</span>
                </span>
                <span className="text-caption text-ink-3">{u.submittedAt ? formatAgo(u.submittedAt) : ''}</span>
              </button>
            ))}
          </div>

          {current && (
            <Card className="flex flex-col gap-5 lg:col-span-8 lg:p-6">
              {done && <p className="text-label text-success">{done}</p>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
                <figure className="flex flex-col items-center gap-2">
                  <img src={current.photoUrl} alt="본인 사진" className="h-40 w-40 rounded-full bg-surface object-cover" />
                  <figcaption className="text-caption text-ink-2">본인 사진</figcaption>
                </figure>
                <figure className="flex flex-col gap-2">
                  {current.idCardUrl ? (
                    <img src={current.idCardUrl} alt="학생증" className="w-full rounded-lg border border-line bg-surface object-contain" />
                  ) : (
                    <div className="flex aspect-[16/10] items-center justify-center rounded-lg bg-surface text-caption text-ink-3">
                      학생증 없음
                    </div>
                  )}
                  <figcaption className="text-caption text-ink-2">학생증</figcaption>
                </figure>
              </div>

              <dl className="grid grid-cols-3 gap-3 rounded-md bg-surface p-4">
                <Field label="이름" value={current.name} />
                <Field label="학번" value={current.studentId} />
                <Field label="학교 이메일" value={current.email} />
              </dl>

              <ul className="flex flex-col gap-1 text-caption text-ink-2">
                <li>· 학생증의 이름·학번이 계정 정보와 같나요?</li>
                <li>· 본인 사진과 학생증 사진이 같은 사람인가요?</li>
              </ul>

              {rejecting ? (
                <div className="flex flex-col gap-3">
                  <p className="text-label text-ink-2">반려 사유 (학생에게 보여요)</p>
                  <FilterChips value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                      돌아가기
                    </Button>
                    <Button size="sm" loading={busy} onClick={() => review(false)}>
                      반려하기
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" icon={<X size={16} strokeWidth={1.75} />} onClick={() => setRejecting(true)}>
                    반려
                  </Button>
                  <Button size="sm" loading={busy} icon={<Check size={16} strokeWidth={1.75} />} onClick={() => review(true)}>
                    승인
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
      <div className="mt-6">
        <NextStepNote>
          실제 서비스에서는 사진을 60초짜리 임시 주소로만 보여주고, 학생증은 학생회만 볼 수 있어요. 승인한 뒤에는 사진을
          바꿀 수 없어요.
        </NextStepNote>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-2">{label}</dt>
      <dd className="truncate text-body text-ink tabular">{value}</dd>
    </div>
  );
}
