import { useState, type ReactNode } from 'react';
import { useAdmin } from '@/app/AdminLayout';
import { useAuth } from '@/app/AuthProvider';
import { formatEventDate, formatWon } from '@/app/format';
import { useTheme } from '@/app/ThemeProvider';
import { Card } from '@/components/Card';
import { NextStepNote } from '@/components/NextStepNote';
import { PageTitle } from '@/components/PageTitle';
import { StateView } from '@/components/StateView';
import { ThemeEditor } from '@/components/ThemeEditor';
import { Toggle } from '@/components/Toggle';
import { updateEventSettings } from '@/lib/api';
import type { EventSettings } from '@/types';

/** 행사 정보 · 입장 규칙 · 개인정보 보관 · 테마 */
export function SettingsPage() {
  const { event, setEvent } = useAdmin();
  const { school } = useAuth();
  const { setThemeEvent } = useTheme();
  const [saving, setSaving] = useState<keyof EventSettings | null>(null);
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
            <Row label="정가" value={formatWon(event.faceValue)} />
            <Row label="발급 허용 도메인" value={event.allowedDomains.map((d) => `@${d}`).join(', ')} />
          </Card>
          <NextStepNote>행사 등록·수정은 다음 단계예요. 프로토타입은 미리 넣어 둔 행사 1개로 동작해요.</NextStepNote>
        </Section>

        <Section title="입장 규칙">
          <Card className="flex flex-col gap-5">
            <Toggle
              label="2단계 검표"
              description="QR이 통과해도 스태프가 사진과 얼굴을 대조하고 승인해야 입장 처리돼요. 계정 대여를 막는 핵심 단계예요"
              checked={event.settings.twoStepCheck}
              disabled={saving !== null}
              onChange={(v) => toggle('twoStepCheck', v)}
            />
            <div className="h-px bg-line" />
            <Toggle
              label="명단에 있는 학생만 발급"
              description="명단 연동에서 불러온 학생만 입장권을 받을 수 있어요. 유료 행사나 학과 행사에 써요"
              checked={event.settings.requireRoster}
              disabled={saving !== null}
              onChange={(v) => toggle('requireRoster', v)}
            />
            {error && <p className="text-caption text-danger">저장하지 못했어요. 다시 시도해 주세요</p>}
          </Card>
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
    <div className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-body text-ink-2">{label}</span>
      <span className="text-body text-ink">{value}</span>
    </div>
  );
}
