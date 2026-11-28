import { useEffect, useState } from 'react';
import { watchChanges, type ChangeTopic } from './changeChannel.ts';

/** 通知が届くか、画面に戻ってくるたびに増える数。読み直すきっかけに使う */
export function useChanges(topic: ChangeTopic): number {
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    const bump = () => {
      if (!document.hidden) setChanges((count) => count + 1);
    };
    document.addEventListener('visibilitychange', bump);
    const stopWatching = watchChanges(topic, bump);
    return () => {
      document.removeEventListener('visibilitychange', bump);
      stopWatching();
    };
  }, [topic]);

  return changes;
}
