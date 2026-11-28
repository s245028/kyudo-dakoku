import { totalUnassigned } from '@kyudo/core';
import { useCallback, useEffect } from 'react';
import { callFunction } from './api.ts';
import type { Penalty } from './home.ts';
import { useRemote } from './useRemote.ts';

/**
 * やることを割り当てていない罰の数。罰を扱える人だけが読み込む。
 * `version` が変わる（画面の内容を読み直す）たびに、数え直す。まだ分からなければ null。
 */
export function useUnassignedPenalties(
  enabled: boolean,
  today: string,
  doublingDays: number,
  version: unknown,
): number | null {
  const load = useCallback(
    () => (enabled ? callFunction<Penalty[]>('penalty_board') : Promise.resolve([])),
    [enabled],
  );
  const { data, reload } = useRemote(load);

  useEffect(() => {
    void reload();
  }, [version, reload]);

  return data ? totalUnassigned(data, today, doublingDays) : null;
}
