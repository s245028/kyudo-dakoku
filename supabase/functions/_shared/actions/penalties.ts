// 罰の操作（副務・主将）
import {
  cleanTaskContent,
  summarizePenalty,
  toPracticeDate,
  validateNewPenalty,
  type PenaltyTask,
} from '../../../../packages/core/src/index.ts';
import { requireCaptain, requireOfficer, type RequestContext } from '../context.ts';
import { inTransaction, type Sql } from '../db.ts';
import { AppError } from '../errors.ts';
import { stringParam, uuidParam, type Params } from '../params.ts';
import { homeSnapshot, loadPenaltyTypes, loadSettings } from '../store.ts';

const NOT_FOUND = '罰が見つかりません。画面を開き直してください。';

function contentParam(params: Params): string {
  const content = cleanTaskContent(stringParam(params, 'content'));
  if (!content) throw new AppError('やることを入力してください。');
  return content;
}

/** 罰1件をロックして、今日時点の状態と一緒に返す。 */
async function lockPenalty(tx: Sql, penaltyId: string, today: string) {
  const [penalty] = await tx<{ date: string; baseCount: number; completed: boolean }[]>`
    select practice_date::text as date, base_count as "baseCount",
      completed_on is not null as completed
    from public.penalties where id = ${penaltyId} for update`;
  if (!penalty) throw new AppError(NOT_FOUND);

  const tasks = await tx<PenaltyTask[]>`
    select id, content,
      (done_at at time zone 'Asia/Tokyo')::date::text as "completedOn"
    from public.penalty_tasks where penalty_id = ${penaltyId}`;
  const { penaltyDoublingDays } = await loadSettings(tx);
  const state = summarizePenalty({
    ...penalty,
    tasks,
    today,
    doublingDays: penaltyDoublingDays,
  });
  return { ...state, completed: penalty.completed };
}

async function respond({ sql, userId, now }: RequestContext) {
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}

export async function addPenalty(context: RequestContext, params: Params) {
  const { sql, userId, now } = context;
  const memberId = uuidParam(params, 'memberId');
  const contents = Array.isArray(params['contents'])
    ? params['contents'].filter((value): value is string => typeof value === 'string')
    : [];

  await inTransaction(sql, async (tx) => {
    const officer = await requireOfficer(tx, userId);
    const input = validateNewPenalty({
      reason: stringParam(params, 'reason'),
      date: stringParam(params, 'date') || toPracticeDate(now),
      memo: stringParam(params, 'memo'),
      contents,
      types: await loadPenaltyTypes(tx),
    });
    if (!input.ok) throw new AppError(input.message);
    const [target] = await tx`select 1 from public.members where id = ${memberId}`;
    if (!target) throw new AppError('部員が見つかりません。');

    const { value } = input;
    const [penalty] = await tx<{ id: string }[]>`
      insert into public.penalties ${tx({
        practice_date: value.date,
        member_id: memberId,
        reason: value.reason,
        base_count: value.baseCount,
        memo: value.memo,
        created_by: officer.id,
        created_at: now,
      })} returning id`;
    await tx`insert into public.penalty_tasks ${tx(
      value.contents.map((content) => ({
        penalty_id: penalty!.id,
        content,
        assigned_by: officer.id,
        assigned_at: now,
      })),
    )}`;
  });
  return respond(context);
}

/** まだ割り当てていない罰（自動の罰や、倍になって増えた分）にやることを割り当てる。 */
export async function assignTask(context: RequestContext, params: Params) {
  const { sql, userId, now } = context;
  const penaltyId = uuidParam(params, 'penaltyId');
  const content = contentParam(params);

  await inTransaction(sql, async (tx) => {
    const officer = await requireOfficer(tx, userId);
    const penalty = await lockPenalty(tx, penaltyId, toPracticeDate(now));
    if (penalty.completed) throw new AppError(NOT_FOUND);
    if (penalty.unassigned < 1) throw new AppError('この罰は、すべて割り当て済みです。');
    await tx`insert into public.penalty_tasks ${tx({
      penalty_id: penaltyId,
      content,
      assigned_by: officer.id,
      assigned_at: now,
    })}`;
  });
  return respond(context);
}

export async function editTask(context: RequestContext, params: Params) {
  const { sql, userId } = context;
  const taskId = uuidParam(params, 'taskId');
  const content = contentParam(params);

  await inTransaction(sql, async (tx) => {
    await requireOfficer(tx, userId);
    const [updated] = await tx`update public.penalty_tasks set content = ${content}
      where id = ${taskId} and done_at is null returning id`;
    if (!updated) throw new AppError('やることが見つかりません。画面を開き直してください。');
  });
  return respond(context);
}

/** 終わった証拠を確認して、やることを消す（罰1個の消化）。 */
export async function completeTask(context: RequestContext, params: Params) {
  const { sql, userId, now } = context;
  const taskId = uuidParam(params, 'taskId');
  const today = toPracticeDate(now);

  await inTransaction(sql, async (tx) => {
    const officer = await requireOfficer(tx, userId);
    const [task] = await tx<{ penaltyId: string }[]>`
      select penalty_id as "penaltyId" from public.penalty_tasks where id = ${taskId}`;
    if (!task) throw new AppError('やることが見つかりません。画面を開き直してください。');
    // 同じ罰のやることを同時に消しても残りが合うよう、先に罰をロックする
    await lockPenalty(tx, task.penaltyId, today);

    const [done] = await tx`update public.penalty_tasks
      set done_at = ${now}, done_by = ${officer.id}
      where id = ${taskId} and done_at is null returning id`;
    if (!done) throw new AppError('すでに消化済みです。');

    const after = await lockPenalty(tx, task.penaltyId, today);
    if (after.remaining === 0) {
      await tx`update public.penalties set completed_on = ${today}
        where id = ${task.penaltyId} and completed_on is null`;
    }
  });
  return respond(context);
}

/** 主将が、罰をまとめて消化済みにする（現行の罰一覧の「消化済み」チェックにあたる）。 */
export async function closePenalty(context: RequestContext, params: Params) {
  const { sql, userId, now } = context;
  const penaltyId = uuidParam(params, 'penaltyId');

  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    const [closed] = await tx`update public.penalties
      set completed_on = ${toPracticeDate(now)}
      where id = ${penaltyId} and completed_on is null returning id`;
    if (!closed) throw new AppError(NOT_FOUND);
  });
  return respond(context);
}
