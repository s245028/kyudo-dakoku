// この端末の通知の登録と解除
import { validatePushSubscription } from '../../../../packages/core/src/index.ts';
import { isAdmin, UNREGISTERED_MESSAGE, type RequestContext } from '../context.ts';
import { AppError } from '../errors.ts';
import { objectParam, stringParam, type Params } from '../params.ts';
import { pushKeys } from '../push.ts';
import { findMemberByDevice } from '../store.ts';

/** 通知は、部員登録した端末と管理者ログインだけが受け取れる。 */
async function requireKnownUser({ sql, userId }: RequestContext): Promise<void> {
  if (await isAdmin(sql, userId)) return;
  if (!(await findMemberByDevice(sql, userId))) throw new AppError(UNREGISTERED_MESSAGE);
}

/** 購読に使う公開鍵を返す。 */
export async function pushConfig(context: RequestContext) {
  await requireKnownUser(context);
  const { publicKey } = await pushKeys(context.sql);
  return { publicKey };
}

export async function pushSubscribe(context: RequestContext, params: Params) {
  const input = validatePushSubscription(objectParam(params, 'subscription'));
  if (!input.ok) throw new AppError(input.message);
  await requireKnownUser(context);
  const { endpoint, p256dh, auth } = input.value;
  const row = {
    endpoint,
    auth_user_id: context.userId,
    p256dh,
    auth_secret: auth,
    created_at: context.now,
  };
  // 同じ端末を別のログインで使い始めたら、届け先を移す
  await context.sql`insert into public.push_subscriptions ${context.sql(row)}
    on conflict (endpoint) do update set
      auth_user_id = excluded.auth_user_id, p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret`;
  return {};
}

export async function pushUnsubscribe({ sql, userId }: RequestContext, params: Params) {
  await sql`delete from public.push_subscriptions
    where endpoint = ${stringParam(params, 'endpoint')} and auth_user_id = ${userId}`;
  return {};
}
