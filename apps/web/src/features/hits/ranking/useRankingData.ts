import { useCallback, useEffect } from 'react';
import { loadHitDays } from '../../../lib/hitQueries.ts';
import { loadDirectory } from '../../../lib/queries.ts';
import { useRemote } from '../../../lib/useRemote.ts';

/** 期間の記録と部員の名前。記録が変わると読み直す */
export function useRankingData(from: string, to: string, changes: number) {
  const load = useCallback(async () => {
    const [days, directory] = await Promise.all([loadHitDays(from, to), loadDirectory()]);
    return { from, to, days, directory };
  }, [from, to]);
  const { data, error, reload } = useRemote(load);

  useEffect(() => {
    if (changes > 0) void reload();
  }, [changes, reload]);

  // 期間を変えた直後は、前の期間の内容を出さない
  return { data: data?.from === from && data.to === to ? data : null, error, reload };
}
