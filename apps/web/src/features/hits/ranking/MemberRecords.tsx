import {
  formatHitRate,
  HIT_CATEGORIES,
  HIT_CATEGORY_LABELS,
  tallyOf,
  totalOf,
  type HitTally,
  type StatsPeriod,
} from '@kyudo/core';
import { useCallback, useEffect, useState } from 'react';
import { dateWithWeekday } from '../../../lib/format.ts';
import { loadMemberHitDays } from '../../../lib/hitQueries.ts';
import type { DirectoryEntry } from '../../../lib/queries.ts';
import { useRemote } from '../../../lib/useRemote.ts';
import { DayEditor } from '../entry/DayEditor.tsx';
import { HitHistory } from './HitHistory.tsx';

const figures = ({ shots, hits }: HitTally) => (shots ? `${hits}/${shots}` : '―');

/** 1人の日ごとの記録。本人と副務・管理者は、日を押して訂正・削除する */
export function MemberRecords({
  member,
  periodLabel,
  period,
  own,
  canCorrect,
  directory,
  changes,
  onBack,
}: {
  member: DirectoryEntry;
  periodLabel: string;
  period: StatsPeriod;
  own: boolean;
  canCorrect: boolean;
  directory: readonly DirectoryEntry[];
  changes: number;
  onBack: () => void;
}) {
  const { from, to } = period;
  const load = useCallback(() => loadMemberHitDays(member.id, from, to), [member.id, from, to]);
  const { data, error, reload } = useRemote(load);
  const [editing, setEditing] = useState<string | null>(null);
  const editable = own || canCorrect;

  useEffect(() => {
    if (changes > 0) void reload();
  }, [changes, reload]);

  if (editing) {
    return (
      <>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setEditing(null);
            void reload();
          }}
        >
          ‹ 日ごとの記録に戻る
        </button>
        <h3>{`${member.name}\u3000${dateWithWeekday(editing)}`}</h3>
        <DayEditor key={editing} memberId={member.id} date={editing} own={own} changes={changes} />
      </>
    );
  }

  const days = [...(data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total = totalOf(days, 'all');

  return (
    <>
      <button type="button" className="text-button" onClick={onBack}>
        ‹ 順位に戻る
      </button>
      <h3>{`${member.name}\u3000${periodLabel}`}</h3>
      <p className="form-error" role="alert">
        {error}
      </p>
      <table className="data-table daily-table">
        <caption>日ごとの記録（的中／射数）</caption>
        <thead>
          <tr>
            <th scope="col">日付</th>
            {HIT_CATEGORIES.map((category) => (
              <th key={category} scope="col">
                {HIT_CATEGORY_LABELS[category]}
              </th>
            ))}
            <th scope="col">計</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">
                {editable ? (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`${dateWithWeekday(day.date)}の記録を直す`}
                    onClick={() => setEditing(day.date)}
                  >
                    {dateWithWeekday(day.date)}
                  </button>
                ) : (
                  dateWithWeekday(day.date)
                )}
              </th>
              {HIT_CATEGORIES.map((category) => (
                <td key={category}>{figures(day.tallies[category])}</td>
              ))}
              <td>
                {figures(tallyOf(day, 'all'))}
                <small>{formatHitRate(tallyOf(day, 'all'))}</small>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">合計</th>
            {HIT_CATEGORIES.map((category) => (
              <td key={category}>{figures(totalOf(days, category))}</td>
            ))}
            <td>
              {figures(total)}
              <small>{formatHitRate(total)}</small>
            </td>
          </tr>
        </tfoot>
      </table>
      {data && days.length === 0 && <p className="empty">この期間の記録はありません</p>}
      {editable && (
        <>
          <p className="hint">日付を押すと、その日の記録を訂正・削除できます。</p>
          <HitHistory
            memberId={member.id}
            from={from}
            to={to}
            directory={directory}
            changes={changes}
          />
        </>
      )}
    </>
  );
}
