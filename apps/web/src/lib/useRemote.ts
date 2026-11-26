import { useCallback, useEffect, useState } from 'react';
import { messageOf } from './api.ts';

/** 画面を開いたときに読み込む値。`load` は同じ関数を渡し続けること。 */
export function useRemote<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [load]);

  useEffect(() => {
    let stale = false;
    load().then(
      (next) => {
        if (!stale) setData(next);
      },
      (cause: unknown) => {
        if (!stale) setError(messageOf(cause));
      },
    );
    return () => {
      stale = true;
    };
  }, [load]);

  return { data, error, reload, setData };
}
