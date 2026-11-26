// 名簿の操作（主将）
import { toPracticeDate, validateMemberUpdate } from '../../../../packages/core/src/index.ts';
import { requireCaptain, type RequestContext } from '../context.ts';
import { inTransaction, type Sql } from '../db.ts';
import { AppError } from '../errors.ts';
import { objectParam, uuidParam, type Params } from '../params.ts';
import { homeSnapshot, lockRoster, type MemberRow } from '../store.ts';

/** アプリから管理できる主将が残らない変更は、取りやめる。 */
export async function ensureCaptainRemains(tx: Sql): Promise<void> {
  const [captain] = await tx`select 1 from public.members
    where role = 'captain' and approved and status in ('active', 'retired')
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
  change: (tx: Sql, target: MemberRow) => Promise<void>,
) {
  const { sql, userId, now } = context;
  const memberId = uuidParam(params, 'memberId');

  await inTransaction(sql, async (tx) => {
    const roster = await lockRoster(tx);
    await requireCaptain(tx, userId);
    const target = roster.find((member) => member.id === memberId);
    if (!target) throw new AppError('部員が見つかりません。画面を開き直してください。');
    await change(tx, target);
    await ensureCaptainRemains(tx);
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

/** 間違った登録の削除。承認していない、記録が何もない人だけ。 */
export const deletePendingMember = (context: RequestContext, params: Params) =>
  changeMember(context, params, async (tx, target) => {
    const [record] = await tx`
      select 1 from public.punches where member_id = ${target.id}
      union all select 1 from public.attendance where member_id = ${target.id}
      union all select 1 from public.penalties where member_id = ${target.id}
      union all select 1 from public.exceptions where member_id = ${target.id}
      limit 1`;
    if (target.approved || record) {
      throw new AppError('削除できるのは、承認していない記録のない人だけです。');
    }
    await tx`delete from public.koma where member_id = ${target.id}`;
    await tx`delete from public.members where id = ${target.id}`;
  });
