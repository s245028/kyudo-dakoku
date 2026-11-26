import { useCallback, useEffect, useRef, useState } from 'react';
import { callFunction, messageOf } from './api.ts';
import type { Home } from './home.ts';
import { readCachedHome, writeCachedHome } from './homeCache.ts';

export function useHome() {
  const [home, setHome] = useState<Home | null>(readCachedHome);
  const [error, setError] = useState<string | null>(null);
  /** 操作の結果より古い読み込みで、上書きしないための番号 */
  const version = useRef(0);

  const apply = useCallback((next: Home) => {
    version.current += 1;
    setHome(next);
    setError(null);
    writeCachedHome(next.member ? next : null);
  }, []);

  const refresh = useCallback(async () => {
    const started = version.current;
    try {
      const next = await callFunction<Home>('home');
      if (version.current === started) apply(next);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [apply]);

  useEffect(() => {
    // 開いたときと、戻ってきたときに読み直す
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { home, error, apply, refresh };
}
