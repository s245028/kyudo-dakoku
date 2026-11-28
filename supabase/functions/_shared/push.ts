// 通知（Web Push）を送る。送れなくても、元の操作は成功のままにする
import webpush from 'web-push';
import {
  PENALTY_WAITING_MESSAGE,
  toPracticeDate,
  totalUnassigned,
  waitingCount,
  type MemberStatus,
  type OpenPenalty,
  type PushMessage,
  type PushSubscriptionInput,
  type Role,
  type WaitingCounts,
} from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';
import { loadSettings } from './store.ts';

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

/** 通知を受け取る役職の人。アイコンの数は、役職で変わる */
type Officer = {
  userId: string;
  role: Role;
  isAdmin: boolean;
  status: MemberStatus;
  approved: boolean;
};

/** `userId` は操作した人。夜の処理にはいない */
type OfficerContext = {
  sql: Sql;
  userId?: string;
  now: Date;
  sendPush?: PushSender | undefined;
};

/** 対応を待っているものの数。数えられなければ、数を送らない */
async function waitingCounts(sql: Sql, now: Date): Promise<WaitingCounts | undefined> {
  try {
    const [row] = await sql<{ notices: number; members: number; penalties: OpenPenalty[] }[]>`
      select private.pending_notice_count() as notices,
        private.pending_member_count() as members,
        private.open_penalties(null) as penalties`;
    const { penaltyDoublingDays } = await loadSettings(sql);
    const tasks = totalUnassigned(row!.penalties, toPracticeDate(now), penaltyDoublingDays);
    return { notices: row!.notices, members: row!.members, tasks };
  } catch (error) {
    console.error('push count failed', (error as { name?: string }).name);
    return undefined;
  }
}

/**
 * 役職の人に知らせる。操作した本人は除く。アイコンには、その人の対応を待っている数を出す。
 * 送れなくても、元の操作は成功のままにする。
 */
async function notifyOfficers(
  { sql, userId, now, sendPush }: OfficerContext,
  load: (sql: Sql) => Promise<Officer[]>,
  message: PushMessage,
): Promise<void> {
  try {
    const officers = (await load(sql)).filter((officer) => officer.userId !== userId);
    if (officers.length === 0) return;
    const counts = await waitingCounts(sql, now);
    await Promise.all(
      officers.map((officer) => {
        const badge = counts && waitingCount(officer, counts);
        return notify(
          sql,
          [officer.userId],
          badge === undefined ? message : { ...message, badge },
          sendPush,
        );
      }),
    );
  } catch (error) {
    console.error('push failed', (error as { name?: string }).name);
  }
}

/** 主将と管理者に知らせる。 */
export const notifyManagers = (context: OfficerContext, message: PushMessage) =>
  notifyOfficers(context, loadManagers, message);

/** 副務に、罰の割り当て待ちが増えたことを知らせる。 */
export const notifyPenaltyWaiting = (context: OfficerContext) =>
  notifyOfficers(context, loadViceOfficers, PENALTY_WAITING_MESSAGE);

/** 主将と管理者（部員と管理者ログイン） */
async function loadManagers(sql: Sql): Promise<Officer[]> {
  return sql<Officer[]>`
    select auth_user_id as "userId", role, is_admin as "isAdmin", status, approved
    from public.members
    where approved and status in ('active', 'retired') and (role = 'captain' or is_admin)
      and auth_user_id is not null
    union all
    select auth_user_id, 'member', true, 'active', true from public.admins a
    where not exists (
      select 1 from public.members m
      where m.auth_user_id = a.auth_user_id and m.approved
        and m.status in ('active', 'retired') and (m.role = 'captain' or m.is_admin))`;
}

async function loadViceOfficers(sql: Sql): Promise<Officer[]> {
  return sql<Officer[]>`
    select auth_user_id as "userId", role, is_admin as "isAdmin", status, approved
    from public.members
    where approved and status in ('active', 'retired') and role = 'vice'
      and auth_user_id is not null`;
}

export async function memberUserIds(sql: Sql, memberId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select auth_user_id as id from public.members
    where id = ${memberId} and auth_user_id is not null`;
  return rows.map((row) => row.id);
}
