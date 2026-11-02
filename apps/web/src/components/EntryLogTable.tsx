import { useEffect, useRef } from 'react';
import { formatTimeSec, maskStudentId } from '@/app/format';
import type { ScanLog } from '@/types';
import { Avatar } from './Avatar';
import { ListItem } from './ListItem';
import { StatusBadge } from './StatusBadge';

/** 최근 검표 기록. md 이상은 표, 폰은 리스트 (DESIGN.md 5장) */
export function EntryLogTable({ logs }: { logs: ScanLog[] }) {
  // 처음 그린 뒤에 들어온 기록만 하이라이트한다
  const seen = useRef<Set<string> | null>(null);
  const isNew = (id: string) => seen.current !== null && !seen.current.has(id);
  useEffect(() => {
    seen.current = new Set(logs.map((l) => l.id));
  }, [logs]);

  const name = (l: ScanLog) => l.userName ?? '알 수 없음';

  return (
    <section className="rounded-lg border border-line bg-bg">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h2 className="text-heading text-ink">최근 기록</h2>
        <span className="text-caption text-ink-3">최근 {logs.length}건</span>
      </div>

      {logs.length === 0 ? (
        <p className="px-5 pb-8 pt-4 text-center text-caption text-ink-2">아직 검표 기록이 없어요</p>
      ) : (
        <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="text-left text-label text-ink-3">
                <th className="px-5 py-3 font-medium">이름</th>
                <th className="py-3 font-medium">학번</th>
                <th className="py-3 font-medium">결과</th>
                <th className="px-5 py-3 text-right font-medium">시각</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className={`h-14 border-t border-line ${isNew(l.id) ? 'animate-row-flash' : ''}`}>
                  <td className="px-5">
                    <div className="flex items-center gap-3">
                      <Avatar src={l.userPhotoUrl} alt={name(l)} size={32} />
                      <span className="text-body text-ink">{name(l)}</span>
                    </div>
                  </td>
                  <td className="text-body text-ink-2 tabular">{maskStudentId(l.studentId)}</td>
                  <td>
                    <StatusBadge kind={l.result} scan />
                  </td>
                  <td className="px-5 text-right text-caption text-ink-3 tabular">{formatTimeSec(l.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-5 pb-2 md:hidden">
            {logs.map((l) => (
              <ListItem
                key={l.id}
                className={isNew(l.id) ? 'animate-row-flash' : undefined}
                leading={<Avatar src={l.userPhotoUrl} alt={name(l)} size={40} />}
                title={name(l)}
                subtitle={`${maskStudentId(l.studentId)} · ${formatTimeSec(l.at)}`}
                trailing={<StatusBadge kind={l.result} scan />}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
