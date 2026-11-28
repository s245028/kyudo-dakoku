import {
  describeTally,
  HIT_CATEGORY_LABELS,
  shortDate,
  toClockTime,
  toPracticeDate,
} from '@kyudo/core';
import { useCallback, useEffect } from 'react';
import { loadHitHistory, type HitHistoryEntry } from '../../../lib/hitQueries.ts';
import type { DirectoryEntry } from '../../../lib/queries.ts';
import { useRemote } from '../../../lib/useRemote.ts';

const operationOf = ({ before, after }: HitHistoryEntry) =>
  !before ? '追加' : !after ? '削除' : '訂正';

function when(instant: string): string {
  const at = new Date(instant);
  return `${shortDate(toPracticeDate(at))} ${toClockTime(at)}`;
}

/** 誰がいつ何を変えたか。本人と副務・管理者だけが読める */
export function HitHistory({
  memberId,
  from,
  to,
  directory,
  changes,
}: {
  memberId: string;
  from: string;
  to: string;
  directory: readonly DirectoryEntry[];
  changes: number;
}) {
  const load = useCallback(() => loadHitHistory(memberId, from, to), [memberId, from, to]);
  const { data, error, reload } = useRemote(load);
  useEffect(() => {
    if (changes > 0) void reload();
  }, [changes, reload]);
  const nameOf = (id: string | null) =>
    id === memberId ? '本人' : (directory.find((member) => member.id === id)?.name ?? '管理者');

  return (
    <>
      <h3>変更の履歴</h3>
      <p className="form-error" role="alert">
        {error}
      </p>
      <ul className="hit-history">
        {data?.length === 0 && <li>変更はありません</li>}
        {data?.map((entry) => (
          <li key={entry.id}>
            <span>
              {`${when(entry.changedAt)}\u3000${nameOf(entry.changedBy)}が ${shortDate(entry.date)} の${HIT_CATEGORY_LABELS[entry.category]}を${operationOf(entry)}`}
            </span>
            <span>
              {describeTally(entry.before)} → {describeTally(entry.after)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
