import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarPlus, CheckCircle2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { cx } from '@/components/cx';
import { PageTitle } from '@/components/PageTitle';
import { SheetImportCard } from '@/components/SheetImportCard';
import { TextField } from '@/components/TextField';
import { getStudentRoster, importStudentRoster, upsertSchool } from '@/lib/api';
import { ApiError, type RosterView } from '@/types';

type Step = 'school' | 'roster' | 'done';
const STEPS: { key: Step; label: string }[] = [
  { key: 'school', label: '학교 정보' },
  { key: 'roster', label: '재학생 명단' },
  { key: 'done', label: '행사 등록' },
];
const SCHOOL_ID = /^[a-z0-9-]{2,32}$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** 처음 세팅: 학교 정보 → 재학생 시트 → 행사 등록으로. 팀 계정은 ?new로 새 학교 스페이스를 연다 */
export function SetupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, school, refreshScope, selectSchool } = useAuth();
  const isNew = !user?.adminSchoolId && params.has('new');
  const existing = isNew ? null : school;
  const [step, setStep] = useState<Step>(existing ? (existing.studentRoster ? 'done' : 'roster') : 'school');
  const [form, setForm] = useState({
    id: user?.adminSchoolId ?? '',
    name: existing?.name ?? '',
    domain: existing?.domain ?? '',
    brandColor: existing?.brandColor ?? '#6B4EFF',
  });
  // 직접 입력하는 hex. 다 치기 전에는 색 선택기에 반영하지 않는다
  const [colorText, setColorText] = useState(form.brandColor.toUpperCase());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<RosterView | null>(null);
  const schoolId = existing?.id ?? form.id;

  const loadRoster = useCallback(() => {
    if (step === 'roster' && schoolId) getStudentRoster(schoolId).then(setView).catch(() => {});
  }, [step, schoolId]);
  useEffect(loadRoster, [loadRoster]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };

  const saveSchool = async (e: FormEvent) => {
    e.preventDefault();
    const domain = form.domain.trim().toLowerCase().replace(/^@/, '');
    if (!SCHOOL_ID.test(form.id)) return setError('학교 ID는 영문 소문자·숫자·- 2~32자예요 (예: korea)');
    if (!DOMAIN.test(domain)) return setError('학교 메일 도메인을 확인해 주세요 (예: korea.ac.kr)');
    if (!HEX.test(colorText)) return setError('상징색은 #과 6자리 hex로 넣어 주세요 (예: #8B0029)');
    setSaving(true);
    try {
      await upsertSchool(form.id, { name: form.name, domain, brandColor: form.brandColor });
      if (user?.adminSchoolId) await refreshScope();
      else await selectSchool(form.id);
      setStep('roster');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'domain_taken'
          ? '이 메일 도메인은 다른 학교 스페이스가 쓰고 있어요'
          : '저장하지 못했어요. 잠시 후 다시 시도해 주세요',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageTitle
        title={isNew ? '새 학교 스페이스' : `${existing?.name ?? '우리 학교'} 스페이스 만들기`}
        description="재학생 명단을 넣으면 학생이 가입할 수 있고, 행사를 등록하면 행사별로 관리할 수 있어요"
      />
      <ol className="flex gap-2" aria-label="진행 단계">
        {STEPS.map((s, i) => {
          const reached = STEPS.findIndex((x) => x.key === step) >= i;
          return (
            <li
              key={s.key}
              aria-current={s.key === step ? 'step' : undefined}
              className={cx(
                'flex h-9 flex-1 items-center justify-center rounded-full text-label',
                reached ? 'bg-lavender text-ink' : 'bg-surface text-ink-3',
              )}
            >
              {i + 1}. {s.label}
            </li>
          );
        })}
      </ol>

      {step === 'school' && (
        <Card>
          <form onSubmit={saveSchool} className="flex flex-col gap-4">
            {!user?.adminSchoolId && (
              <TextField label="학교 ID" placeholder="korea" value={form.id} onChange={set('id')} hint="주소와 데이터에 쓰는 영문 이름이에요" />
            )}
            <TextField label="학교 이름" placeholder="고려대학교" value={form.name} onChange={set('name')} />
            <TextField
              label="학교 메일 도메인"
              placeholder="korea.ac.kr"
              value={form.domain}
              onChange={set('domain')}
              hint="이 도메인 메일만 가입할 수 있어요"
            />
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-2 text-label text-ink-2">
                <span className="sr-only">상징색 고르기</span>
                <input
                  type="color"
                  value={form.brandColor}
                  onChange={(e) => {
                    set('brandColor')(e);
                    setColorText(e.target.value.toUpperCase());
                  }}
                  className="h-[52px] w-16 cursor-pointer rounded-md border border-line bg-bg"
                />
              </label>
              <TextField
                className="flex-1"
                label="학교 상징색"
                placeholder="#8B0029"
                maxLength={7}
                value={colorText}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const text = (raw.startsWith('#') ? raw : `#${raw}`).toUpperCase();
                  setColorText(text);
                  setError(null);
                  if (HEX.test(text)) setForm((f) => ({ ...f, brandColor: text }));
                }}
                hint="색을 고르거나 hex 코드를 직접 넣어요"
              />
            </div>
            {error && <p className="text-caption text-danger">{error}</p>}
            <Button type="submit" loading={saving} disabled={!form.name.trim() || !form.domain.trim()}>
              다음
            </Button>
          </form>
        </Card>
      )}

      {step === 'roster' && (
        <SheetImportCard
          view={view}
          onImport={(url) => importStudentRoster(schoolId, url)}
          onImported={() => {
            void refreshScope();
            setStep('done');
          }}
        />
      )}

      {step === 'done' && (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 size={40} strokeWidth={1.5} className="text-success" />
          <div>
            <p className="text-title text-ink">스페이스가 준비됐어요</p>
            <p className="mt-1 text-body text-ink-2">이제 학생들이 가입할 수 있어요. 첫 행사를 등록해 보세요</p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button icon={<CalendarPlus size={18} strokeWidth={1.75} />} onClick={() => navigate('/admin/events/new')}>
              행사 등록
            </Button>
            <Button variant="ghost" icon={<ArrowRight size={18} strokeWidth={1.75} />} onClick={() => navigate('/admin/students')}>
              재학생 명단 보기
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
