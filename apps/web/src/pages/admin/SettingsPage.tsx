import { useState, type ReactNode } from 'react';
import { ListOrdered, Shuffle } from '@/components/icons';
import { useAdmin } from '@/app/AdminLayout';
import { useAuth } from '@/app/AuthProvider';
import { formatEventDate } from '@/app/format';
import { useTheme } from '@/app/ThemeProvider';
import { Card } from '@/components/Card';
import { cx } from '@/components/cx';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { StateView } from '@/components/StateView';
import { ThemeEditor } from '@/components/ThemeEditor';
import { Toggle } from '@/components/Toggle';
import { formatRate, updateAllowReissue, updateDrawSettings, updateEventSettings, updateReassignMode } from '@/lib/api';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import type { EventSettings, ReassignMode } from '@/types';

const MODES: { value: ReassignMode; icon: typeof ListOrdered; title: string; text: string }[] = [
  { value: 'queue', icon: ListOrdered, title: '대기 순서대로', text: '대기 명단에 먼저 등록한 학생부터 받아요' },
  { value: 'random', icon: Shuffle, title: '무작위', text: '대기 명단 안에서 무작위로 한 명이 받아요' },
];

/** 행사 정보 · 입장 규칙 · 취소표 재배정 · 개인정보 보관 · 테마 */
export function SettingsPage() {
  const { event, setEvent } = useAdmin();
  const { school } = useAuth();
  const { setThemeEvent } = useTheme();
  const [saving, setSaving] = useState<keyof EventSettings | 'reassignMode' | 'allowReissue' | 'draw' | null>(null);
  const [pool, setPool] = useState<string | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!event || !school) return <StateView kind="loading" />;

  const toggle = async (key: keyof EventSettings, value: boolean) => {
    setSaving(key);
    setError(false);
    try {
      setEvent(await updateEventSettings(event.id, { ...event.settings, [key]: value }));
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  const changeMode = async (mode: ReassignMode) => {
    if (mode === event.reassignMode) return;
    setSaving('reassignMode');
    setError(false);
    try {
      setEvent(await updateReassignMode(event.id, mode));
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  const toggleReissue = async (allow: boolean) => {
    setSaving('allowReissue');
    setError(false);
    try {
      setEvent(await updateAllowReissue(event.id, allow));
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  const poolValue = pool ?? String(event.drawPool ?? '');
  const poolNumber = Number(poolValue);
  const poolValid = /^\d+$/.test(poolValue) && poolNumber > 0 && poolNumber <= 1_000_000;
  const rateOf = (p: number) => (p > event.capacity ? Math.max(1, Math.floor((event.capacity * 10_000) / p)) : 10_000);

  const saveDraw = async (instantDraw: boolean) => {
    if (instantDraw && !poolValid) {
      setDrawError('재학생 수를 1 이상의 숫자로 넣어 주세요');
      return;
    }
    setSaving('draw');
    setDrawError(null);
    try {
      setEvent(await updateDrawSettings(event.id, { instantDraw, drawPool: poolValid ? poolNumber : (event.drawPool ?? 0) }));
      setPool(null);
    } catch {
      setDrawError('저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(null);
    }
  };

  const deleteAt = new Date(new Date(event.date).getTime() + event.dataRetentionDays * 86_400_000);

  return (
    <>
      <PageTitle title="행사 설정" description="입장 규칙과 화면 색을 정해요" />
      <div className="flex flex-col gap-6">
        <Section title="행사 정보">
          <Card padded={false} className="divide-y divide-line">
            <Row label="행사명" value={event.name} />
            <Row label="일시" value={formatEventDate(event.date)} />
            <Row label="장소" value={event.place} />
            <Row label="정원" value={`${event.capacity.toLocaleString('ko-KR')}명`} />
            <Row label="발급 허용 도메인" value={event.allowedDomains.map((d) => `@${d}`).join(', ')} />
          </Card>
          <NextStepNote>행사 등록·수정은 다음 단계예요. 프로토타입은 미리 넣어 둔 행사 1개로 동작해요.</NextStepNote>
        </Section>

        <Section title="즉석 추첨">
          <Card className="flex flex-col gap-5">
            <Toggle
              label="추첨으로 발급"
              description="학생이 행사 화면을 열면 응모되고, 블록체인이 정한 당첨자만 입장권을 받아요. 한 학생은 한 번만 추첨돼요"
              checked={!!event.instantDraw}
              disabled={saving !== null}
              onChange={(v) => saveDraw(v)}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextField
                label="응모 대상 재학생 수"
                inputMode="numeric"
                value={poolValue}
                onChange={(e) => setPool(e.target.value.replace(/[^\d]/g, ''))}
                suffix="명"
                className="sm:max-w-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                loading={saving === 'draw'}
                disabled={saving !== null || !poolValid || poolNumber === event.drawPool}
                onClick={() => saveDraw(!!event.instantDraw)}
              >
                저장
              </Button>
            </div>
            <p className="text-caption text-ink-2">
              {poolValid
                ? `정원 ${event.capacity.toLocaleString('ko-KR')}명 ÷ 재학생 ${poolNumber.toLocaleString('ko-KR')}명 = 당첨 확률 ${formatRate(rateOf(poolNumber))}`
                : '재학생 수를 넣으면 당첨 확률을 계산해요'}
              . 이미 응모한 학생의 확률은 바뀌지 않아요 (응모할 때 체인에 고정돼요)
            </p>
            {drawError && <p className="text-caption text-danger">{drawError}</p>}
          </Card>
        </Section>

        <Section title="입장 규칙">
          <Card className="flex flex-col gap-5">
            {event.instantDraw && (
              <p className="text-caption text-ink-2">추첨 행사는 행사 명단 대신 추첨 결과로 발급해요. 아래 설정은 추첨을 끄면 적용돼요</p>
            )}
            <Toggle
              label="명단에 있는 학생만 발급"
              description="명단 연동에서 불러온 학생만 입장권을 받을 수 있어요. 학과 행사처럼 대상이 정해진 행사에 써요"
              checked={event.settings.requireRoster}
              disabled={saving !== null}
              onChange={(v) => toggle('requireRoster', v)}
            />
            {error && <p className="text-caption text-danger">저장하지 못했어요. 다시 시도해 주세요</p>}
          </Card>
        </Section>

        <Section title="취소표 재배정">
          <p className="text-caption text-ink-2">
            학생이 입장권을 취소하면 대기 명단의 재학생에게 자동으로 넘어가요. 학생끼리 직접 넘기는 양도는 없어요
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MODES.map(({ value, icon: Icon, title, text }) => (
              <button
                key={value}
                type="button"
                disabled={saving !== null}
                aria-pressed={event.reassignMode === value}
                onClick={() => changeMode(value)}
                className={cx(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition duration-200',
                  event.reassignMode === value ? 'border-ink bg-surface' : 'border-line',
                )}
              >
                <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-2" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-body text-ink">{title}</span>
                  <span className="text-caption text-ink-2">{text}</span>
                </span>
              </button>
            ))}
          </div>
          <Card>
            <Toggle
              label="취소 후 다시 받기 허용 (테스트용)"
              description="켜면 입장권을 취소한 학생도 다시 받을 수 있어요. 테스트할 때만 켜고, 실제 행사 전에는 꺼 주세요"
              checked={event.allowReissueAfterCancel}
              disabled={saving !== null}
              onChange={toggleReissue}
            />
          </Card>
          {error && <p className="text-caption text-danger">저장하지 못했어요. 다시 시도해 주세요</p>}
        </Section>

        <Section title="개인정보 보관">
          <Card className="flex flex-col gap-1">
            <p className="text-body text-ink">
              행사 종료 {event.dataRetentionDays}일 뒤 ({deleteAt.getMonth() + 1}월 {deleteAt.getDate()}일) 자동 삭제
            </p>
            <p className="text-caption text-ink-2">
              본인 사진, 학생증 사진, 입장 기록, 명단이 지워져요. 블록체인의 입장권 번호와 지갑 주소는 개인정보가 아니라서
              남아요.
            </p>
          </Card>
        </Section>

        <ThemeEditor
            key={event.id}
            event={event}
            school={school}
            onApplied={(e) => {
              setEvent(e);
              setThemeEvent(e);
            }}
          />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-heading text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-body text-ink-2">{label}</span>
      <span className="text-body text-ink">{value}</span>
    </div>
  );
}
