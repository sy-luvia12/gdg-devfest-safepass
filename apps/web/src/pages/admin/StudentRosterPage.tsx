import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/Button';
import { PageTitle } from '@/components/PageTitle';
import { RosterPreview, SheetImportCard } from '@/components/SheetImportCard';
import { StateView } from '@/components/StateView';
import { getStudentRoster, importStudentRoster } from '@/lib/api';
import type { RosterView } from '@/types';

/** 재학생 명단 (학교 전체). 회원가입할 때 이름·학번·학교 메일을 이 명단과 대조한다 */
export function StudentRosterPage() {
  const { school, refreshScope } = useAuth();
  const schoolId = school?.id ?? '';
  const [view, setView] = useState<RosterView | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!schoolId) return;
    setError(false);
    getStudentRoster(schoolId).then(setView).catch(() => setError(true));
  }, [schoolId]);
  useEffect(load, [load]);

  if (!school) return <StateView kind="loading" />;

  return (
    <>
      <PageTitle
        title="재학생 명단"
        description={`${school.name} 전체 재학생 시트예요. 회원가입할 때 이름·학번·학교 메일을 이 명단과 대조해요`}
      />
      {error ? (
        <StateView
          kind="error"
          title="명단을 불러오지 못했어요"
          action={<Button variant="secondary" onClick={load}>다시 시도</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <SheetImportCard
            view={view}
            onImport={(url) => importStudentRoster(schoolId, url)}
            onImported={() => {
              load();
              void refreshScope();
            }}
          />
          {view === null ? (
            <StateView kind="loading" />
          ) : view.summary ? (
            <RosterPreview view={view} />
          ) : (
            <StateView kind="empty" title="아직 불러온 명단이 없어요" description="명단이 있어야 학생이 가입할 수 있어요" />
          )}
        </div>
      )}
    </>
  );
}
