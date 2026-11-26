import { toClockTime, toPracticeDate } from '@kyudo/core';
import { shortDate } from '../../lib/format.ts';
import { loadLastNightlyRun, type NightlyRun } from '../../lib/queries.ts';
import { useRemote } from '../../lib/useRemote.ts';

function describe(run: NightlyRun): string {
  const at = new Date(run.ranAt);
  return `${shortDate(toPracticeDate(at))} ${toClockTime(at)}（自動退室${run.checkedOut}人・判定${run.judged}人）`;
}

/** 夜の自動処理が動いているかを確かめる表示 */
export function NightlyStatus() {
  const { data, error } = useRemote(loadLastNightlyRun);
  if (error) return null;

  return (
    <p className="hint">夜の自動処理の最後の実行：{data ? describe(data) : 'まだありません'}</p>
  );
}
