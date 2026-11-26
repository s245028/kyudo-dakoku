import { useEffect, useState } from 'react';

const TICK_MS = 15_000;

/** 今の時刻。締め切りや日付の変わり目が画面に反映されるよう、定期的に更新する。 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, TICK_MS);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return now;
}
