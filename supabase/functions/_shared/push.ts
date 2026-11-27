// 通知（Web Push）を送る。送れなくても、元の操作は成功のままにする
import webpush from 'web-push';
import type { PushMessage, PushSubscriptionInput } from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';

/** 通知の送り主として中継先に伝える連絡先。個人のアドレスは使わない */
const VAPID_SUBJECT = 'https://kyudo-dakoku.vercel.app';
/** 受け取れない端末に、中継先が届け直す時間 */
const TTL_SECONDS = 12 * 60 * 60;
const SEND_TIMEOUT_MS = 3000;
/** 購読がなくなっているときの応答 */
const GONE_STATUSES = [404, 410];

export type PushKeys = { publicKey: string; privateKey: string };

/** 1件送って、中継先の応答の番号を返す */
export type PushSender = (
  keys: PushKeys,
  subscription: PushSubscriptionInput,
  payload: string,
) => Promise<number>;

/** 通知の鍵。なければ作る。 */
export async function pushKeys(sql: Sql): Promise<PushKeys> {
  const read = () => sql<PushKeys[]>`
    select public_key as "publicKey", private_key as "privateKey" from public.push_keys`;
  const [stored] = await read();
  if (stored) return stored;
  const created = webpush.generateVAPIDKeys();
  await sql`insert into public.push_keys ${sql({
    public_key: created.publicKey,
    private_key: created.privateKey,
  })} on conflict (id) do nothing`;
  const [saved] = await read();
  return saved!;
}

export const sendWebPush: PushSender = async (keys, subscription, payload) => {
  const { endpoint, p256dh, auth } = subscription;
  const request = webpush.generateRequestDetails({ endpoint, keys: { p256dh, auth } }, payload, {
    vapidDetails: { subject: VAPID_SUBJECT, ...keys },
    TTL: TTL_SECONDS,
  });
  // 長さは fetch がつける
  const headers = Object.entries(request.headers)
    .filter(([name]) => name.toLowerCase() !== 'content-length')
    .map(([name, value]): [string, string] => [name, String(value)]);
  const response = await fetch(request.endpoint, {
    method: request.method,
    headers,
    body: new Uint8Array(request.body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  await response.body?.cancel();
  return response.status;
};

/** 指定したログインの端末すべてに送る。なくなった購読は消す。 */
export async function notify(
  sql: Sql,
  userIds: readonly string[],
  message: PushMessage,
  send: PushSender = sendWebPush,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const subscriptions = await sql<PushSubscriptionInput[]>`
      select endpoint, p256dh, auth_secret as auth from public.push_subscriptions
      where auth_user_id in ${sql(userIds as string[])}`;
    if (subscriptions.length === 0) return;
    const keys = await pushKeys(sql);
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const status = await send(keys, subscription, JSON.stringify(message)).catch(() => 0);
        if (GONE_STATUSES.includes(status)) {
          await sql`delete from public.push_subscriptions
            where endpoint = ${subscription.endpoint}`;
        }
      }),
    );
  } catch (error) {
    // 個人情報がログに残らないよう、種類だけを出す
    console.error('push failed', (error as { name?: string }).name);
  }
}

/** 主将と管理者に知らせる。送った本人は除く。 */
export async function notifyManagers(
  { sql, userId, sendPush }: { sql: Sql; userId: string; sendPush?: PushSender },
  message: PushMessage,
): Promise<void> {
  const managers = await managerUserIds(sql);
  await notify(
    sql,
    managers.filter((id) => id !== userId),
    message,
    sendPush,
  );
}

/** 主将と管理者（部員と管理者ログイン）のログイン */
async function managerUserIds(sql: Sql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select auth_user_id as id from public.members
    where approved and status in ('active', 'retired') and role in ('captain', 'admin')
      and auth_user_id is not null
    union
    select auth_user_id from public.admins`;
  return rows.map((row) => row.id);
}

export async function memberUserIds(sql: Sql, memberId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select auth_user_id as id from public.members
    where id = ${memberId} and auth_user_id is not null`;
  return rows.map((row) => row.id);
}
