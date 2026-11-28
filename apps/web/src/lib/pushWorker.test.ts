// 通知を受け取る Service Worker（public/push-sw.js）の確認
import { describe, expect, it, vi } from 'vitest';
import source from '../../public/push-sw.js?raw';

type PushEvent = { data: { json: () => object }; waitUntil: (work: Promise<unknown>) => void };

/** 代わりの `self` で読み込み、通知を1件受け取らせる */
async function push(message: object, badgeSupported = true) {
  const handlers = new Map<string, (event: PushEvent) => void>();
  const setAppBadge = vi.fn(() => Promise.resolve());
  const showNotification = vi.fn(() => Promise.resolve());
  const self = {
    addEventListener: (type: string, handler: (event: PushEvent) => void) =>
      handlers.set(type, handler),
    registration: { showNotification },
    navigator: badgeSupported ? { setAppBadge } : {},
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- 配信するファイルをそのまま動かす
  const load = new Function('self', source) as (scope: typeof self) => void;
  load(self);
  let done: Promise<unknown> = Promise.resolve();
  handlers.get('push')!({
    data: { json: () => message },
    waitUntil: (work) => {
      done = work;
    },
  });
  await done;
  return { setAppBadge, showNotification };
}

describe('通知を受け取ったとき', () => {
  it('通知を出し、アイコンに数を出す', async () => {
    const { setAppBadge, showNotification } = await push({ title: '届きました', badge: 3 });

    expect(showNotification).toHaveBeenCalledOnce();
    expect(setAppBadge).toHaveBeenCalledWith(3);
  });

  it('同じ種類の通知を入れ替える指定を引き継ぐ', async () => {
    const { showNotification } = await push({ title: '届きました', tag: 'penalty-waiting' });

    expect(showNotification).toHaveBeenCalledWith(
      '届きました',
      expect.objectContaining({ tag: 'penalty-waiting' }),
    );
  });

  it('数がない通知は、アイコンを変えない', async () => {
    const { setAppBadge } = await push({ title: '承認されました' });

    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('数字に対応していない端末でも、通知は出る', async () => {
    const { showNotification } = await push({ title: '届きました', badge: 3 }, false);

    expect(showNotification).toHaveBeenCalledOnce();
  });
});
