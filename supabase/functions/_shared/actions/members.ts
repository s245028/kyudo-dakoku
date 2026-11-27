// 名簿の操作（主将）
import {
  adminOnlyRefusal,
  ROLES,
  toPracticeDate,
  validateMemberUpdate,
} from '../../../../packages/core/src/index.ts';
import { requireCaptain, type Actor, type RequestContext } from '../context.ts';
import { inTransaction, type Sql } from '../db.ts';
import { AppError, refuseIf } from '../errors.ts';
import { booleanParam, objectParam, uuidParam, type Params } from '../params.ts';
import { homeSnapshot, lockRoster, type MemberRow } from '../store.ts';

/**
 * アプリから管理できる人（主将・管理者）が残らない変更は、取りやめる。
 * 管理者ログインは自分で直せるので対象外（唯一の主将の再登録を許可する場合など）。
 */
export async function ensureManagerRemains(tx: Sql, actor: Actor): Promise<void> {
  if (actor.id === null) return;
  const [captain] = await tx`select 1 from public.members
    where role in ('captain', 'admin') and approved and status in ('active', 'retired')
      and auth_user_id is not null
    limit 1`;
  if (!captain) {
    throw new AppError('主将がいなくなるため、変更できません。先に別の主将を指定してください。');
  }
}

/** 名簿をロックして、変える部員を探す。 */
async function changeMember(
  context: RequestContext,
  params: Params,
  change: (tx: Sql, target: MemberRow, actor: Actor) => Promise<void>,
) {
  const { sql, userId, now } = context;
  const memberId = uuidParam(params, 'memberId');

  await inTransaction(sql, async (tx) => {
    const roster = await lockRoster(tx);
    const actor = await requireCaptain(tx, userId);
    const target = roster.find((member) => member.id === memberId);
    if (!target) throw new AppError('部員が見つかりません。画面を開き直してください。');
    const nextRole = ROLES.find((role) => role === objectParam(params, 'changes')['role']);
    refuseIf(adminOnlyRefusal({ actorIsAdmin: actor.isAdmin, targetRole: target.role, nextRole }));
    await change(tx, target, actor);
    await ensureManagerRemains(tx, actor);
  });
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}

export const approveMember = (context: RequestContext, params: Params) =>
  changeMember(context, params, async (tx, target) => {
    await tx`update public.members set approved = true where id = ${target.id}`;
  });

export const updateMember = (context: RequestContext, params: Params) =>
  changeMember(context, params, async (tx, target) => {
    const update = validateMemberUpdate(
      objectParam(params, 'changes'),
      target,
      toPracticeDate(context.now),
    );
    if (!update.ok) throw new AppError(update.message);
    const { retiredOn, ...rest } = update.value;
    const columns = { ...rest, ...(retiredOn !== undefined ? { retired_on: retiredOn } : {}) };
    if (Object.keys(columns).length === 0) return;
    await tx`update public.members set ${tx(columns)} where id = ${target.id}`;
  });

/** 端末との結びつきを外す。本人が同じ学生番号で登録し直すと、承認はやり直し。 */
export const resetDevice = (context: RequestContext, params: Params) =>
  changeMember(context, params, async (tx, target) => {
    await tx`update public.members set auth_user_id = null where id = ${target.id}`;
  });

/** その部員の記録（打刻・出欠・罰・臨時変更）があるか。コマ表だけなら記録とみなさない。 */
async function hasRecords(tx: Sql, memberId: string): Promise<boolean> {
  const [record] = await tx`
    select 1 from public.punches where member_id = ${memberId}
    union all select 1 from public.attendance where member_id = ${memberId}
    union all select 1 from public.penalties where member_id = ${memberId}
    union all select 1 from public.exceptions where member_id = ${memberId}
    limit 1`;
  return record !== undefined;
}

/** その部員を消す。本人の記録はすべて消し、本人が記録した他人の記録は残して記録者を空にする。 */
async function removeMember(tx: Sql, memberId: string): Promise<void> {
  await tx`delete from public.punches where member_id = ${memberId}`;
  await tx`delete from public.attendance where member_id = ${memberId}`;
  // やることは罰と一緒に消える
  await tx`delete from public.penalties where member_id = ${memberId}`;
  await tx`delete from public.exceptions where member_id = ${memberId}`;
  await tx`delete from public.koma where member_id = ${memberId}`;

  await tx`update public.exceptions set created_by = null where created_by = ${memberId}`;
  await tx`update public.exceptions set reviewed_by = null where reviewed_by = ${memberId}`;
  // 立ち順に残る id は、表示するときに名簿にないので出ない
  await tx`update public.lineups set updated_by = null where updated_by = ${memberId}`;
  await tx`update public.penalties set created_by = null where created_by = ${memberId}`;
  await tx`update public.penalties set canceled_by = null where canceled_by = ${memberId}`;
  await tx`update public.penalty_tasks set assigned_by = null where assigned_by = ${memberId}`;
  await tx`update public.penalty_tasks set done_by = null where done_by = ${memberId}`;
  await tx`update public.grade_promotions set executed_by = null
    where executed_by = ${memberId}`;
  await tx`delete from public.members where id = ${memberId}`;
}

/**
 * 部員を削除する。元に戻せない。退部した人の記録を残すには、状態を「休部・退部」にする。
 * 記録がある人は、`deleteRecords` を指定したときだけ削除する（承認待ちの一覧からの誤操作を防ぐ）。
 */
export const deleteMember = (context: RequestContext, params: Params) =>
  changeMember(context, params, async (tx, target, actor) => {
    if (target.id === actor.id) throw new AppError('自分は削除できません。');
    if (!booleanParam(params, 'deleteRecords') && (await hasRecords(tx, target.id))) {
      throw new AppError('記録がある人です。承認してから、部員名簿で削除してください。');
    }
    await removeMember(tx, target.id);
  });
