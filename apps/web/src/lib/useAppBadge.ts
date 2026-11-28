import { useEffect } from 'react';

/**
 * ホーム画面のアイコンに数字を出す。0 なら消し、null なら変えない。
 * 対応していない端末や、通知を許可していない端末では、何も出ない。
 */
export function useAppBadge(count: number | null) {
  useEffect(() => {
    if (count === null || !('setAppBadge' in navigator)) return;
    const updated = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    // 数字は補助の表示なので、失敗しても画面はそのままにする
    updated.catch(() => {});
  }, [count]);
}
