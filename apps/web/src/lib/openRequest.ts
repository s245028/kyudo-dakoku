// 通知を押したときに開く画面の指定を受け取る
import { OPEN_TARGETS, type OpenTarget } from '@kyudo/core';

const targetOf = (value: unknown) => OPEN_TARGETS.find((target) => target === value) ?? null;

function readInitial(): OpenTarget | null {
  const url = new URL(location.href);
  const target = targetOf(url.searchParams.get('open'));
  if (url.searchParams.has('open')) {
    // 開き直したときに、また同じ画面にならないようにする
    url.searchParams.delete('open');
    history.replaceState(null, '', url);
  }
  return target;
}

/** アプリを閉じた状態で通知を押したときの指定 */
export const initialOpenTarget = readInitial();

/** アプリを開いている間に通知を押したときの指定を受け取る。戻り値を呼ぶとやめる。 */
export function onOpenRequest(open: (target: OpenTarget) => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {};
  const listen = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown; open?: unknown } | null;
    const target = data?.type === 'open' ? targetOf(data.open) : null;
    if (target) open(target);
  };
  navigator.serviceWorker.addEventListener('message', listen);
  return () => navigator.serviceWorker.removeEventListener('message', listen);
}
