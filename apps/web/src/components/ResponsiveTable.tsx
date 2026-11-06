import type { ReactNode } from 'react';
import { cx } from './cx';

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };

type Props<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  /** 폰에서 보여줄 한 줄 (ListItem 등) */
  mobile: (row: T) => ReactNode;
  empty?: string;
};

/** 관리자 목록: md 이상은 표, 폰은 리스트 (DESIGN.md 5장 EntryLogTable과 같은 규칙) */
export function ResponsiveTable<T>({ rows, rowKey, columns, mobile, empty = '표시할 항목이 없어요' }: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="responsive-data-list rounded-lg border border-line bg-bg px-5 py-12 text-center text-caption text-ink-2">{empty}</div>
    );
  }
  return (
    <div className="responsive-data-list rounded-lg border border-line bg-bg">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead>
            <tr className="text-left text-label text-ink-3">
              {columns.map((c) => (
                <th key={c.header} className={cx('whitespace-nowrap px-5 py-3 font-medium', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="h-14 border-t border-line">
                {columns.map((c) => (
                  <td key={c.header} className={cx('px-5 py-2 text-body text-ink', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)}>{mobile(r)}</div>
        ))}
      </div>
    </div>
  );
}
