import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PageTitle } from '@/components/PageTitle';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { Toggle } from '@/components/Toggle';
import { createEvent, listSchools } from '@/lib/api';
import type { School } from '@/types';

/** 행사 등록. 주최는 지금 학교, 고연전처럼 함께하는 학교를 하나 더 고를 수 있다 */
export function EventFormPage() {
  const navigate = useNavigate();
  const { school, refreshScope } = useAuth();
  const [others, setOthers] = useState<School[]>([]);
  const [form, setForm] = useState({ name: '', date: '', place: '', capacity: '', faceValue: '0', partnerId: '' });
  const [requireRoster, setRequireRoster] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSchools()
      .then((all) => setOthers(all.filter((s) => s.id !== school?.id)))
      .catch(() => setOthers([]));
  }, [school?.id]);

  if (!school) return <StateView kind="loading" />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };
  const capacity = Number(form.capacity);
  const faceValue = Number(form.faceValue || 0);
  const valid =
    form.name.trim() && form.place.trim() && form.date && Number.isInteger(capacity) && capacity > 0 && faceValue >= 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const event = await createEvent({
        schoolIds: form.partnerId ? [school.id, form.partnerId] : [school.id],
        name: form.name,
        // 입력은 한국 시간
        date: `${form.date}:00+09:00`,
        place: form.place,
        capacity,
        faceValue,
        requireRoster,
      });
      await refreshScope(event.id);
      navigate(requireRoster ? '/admin/roster' : '/admin', { replace: true });
    } catch {
      setError('행사를 등록하지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageTitle title="행사 등록" description={`주최: ${school.name}. 등록한 뒤 행사 명단을 넣을 수 있어요`} />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField label="행사 이름" placeholder="2026 대동제" value={form.name} onChange={set('name')} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="날짜·시간" type="datetime-local" value={form.date} onChange={set('date')} />
            <TextField label="장소" placeholder="대운동장" value={form.place} onChange={set('place')} />
            <TextField label="정원" type="number" inputMode="numeric" min={1} suffix="명" value={form.capacity} onChange={set('capacity')} />
            <TextField
              label="정가"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              suffix="원"
              value={form.faceValue}
              onChange={set('faceValue')}
              hint="무료 행사는 0"
            />
          </div>
          {others.length > 0 && (
            <label className="flex flex-col gap-2 text-label text-ink-2">
              함께하는 학교 (선택)
              <select
                value={form.partnerId}
                onChange={set('partnerId')}
                className="h-[52px] rounded-md bg-surface px-4 text-body text-ink outline-none focus-visible:ring-2 focus-visible:ring-lavender"
              >
                <option value="">없음</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Toggle
            label="명단에 있는 학생만 발급"
            description="당첨자·신청자 시트를 넣고 그 학생만 받게 해요. 끄면 승인된 재학생 누구나 받아요"
            checked={requireRoster}
            onChange={setRequireRoster}
          />
          {error && <p className="text-caption text-danger">{error}</p>}
          <Button type="submit" loading={saving} disabled={!valid}>
            행사 등록
          </Button>
        </form>
      </Card>
    </div>
  );
}
