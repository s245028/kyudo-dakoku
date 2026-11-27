// この端末で通知を受け取る設定
import { ApiError, callAction } from './api.ts';
import { currentBrowser } from './browser.ts';

/**
 * - `unsupported`：この端末やブラウザでは使えない
 * - `needs-install`：iPhone は、ホーム画面に追加して開くと使える
 * - `blocked`：端末の設定で通知を許可していない
 */
export type PushStatus = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

const toBytes = (base64Url: string) =>
  Uint8Array.from(atob(base64Url.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
    char.charCodeAt(0),
  );

const send = (subscription: PushSubscription) =>
  callAction('push-subscribe', { subscription: subscription.toJSON() });

/** 今の状態を調べる。受け取る設定なら、サーバーの届け先もこの端末のログインに合わせる。 */
export async function pushStatus(): Promise<PushStatus> {
  if (currentBrowser() === 'ios-browser') return 'needs-install';
  const worker = await registration();
  if (!worker || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription || Notification.permission !== 'granted') return 'off';
  await send(subscription);
  return 'on';
}

/** 購読に使う公開鍵。ボタンを押してすぐ使えるよう、先に読んでおく */
export async function loadPushPublicKey(): Promise<string> {
  const { publicKey } = await callAction<{ publicKey: string }>('push-config');
  return publicKey;
}

/** 通知を受け取り始める。許可を聞くので、ボタンを押したときに呼ぶ。 */
export async function enablePush(publicKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const worker = await registration();
  if (!worker) return 'unsupported';
  try {
    // 前の鍵の購読が残っていると、作り直せない
    await (await worker.pushManager.getSubscription())?.unsubscribe();
    const subscription = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(publicKey),
    });
    await send(subscription);
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError('通知を設定できませんでした。時間をおいて、もう一度お試しください。');
  }
  return 'on';
}

export async function disablePush(): Promise<PushStatus> {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (subscription) {
    await callAction('push-unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return 'off';
}
