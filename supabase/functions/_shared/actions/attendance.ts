// 臨時変更と出欠一覧の操作（主将）
import {
  isPracticeDate,
  toPracticeDate,
  validateException,
  validateManualJudgement,
  type Judgement,
} from '../../../../packages/core/src/index.ts';
import { requireCaptain, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { judgeDate, syncAutoPenalties } from '../judge.ts';
import { stringParam, uuidParam, type Params } from '../params.ts';

export async function addException({ sql, userId, now }: RequestContext, params: Params) {
  const input = validateException(params);
  if (!input.ok) throw new AppError(input.message);
  const { date, memberId, kind, memo, contactedAt } = input.value;
  if (memberId !== null) uuidParam(params, 'memberId');

  await inTransaction(sql, async (tx) => {
    const captain = await requireCaptain(tx, userId);
    if (memberId !== null) {
      const [target] = await tx`select 1 from public.members where id = ${memberId}`;
      if (!target) throw new AppError('部員が見つかりません。');
    }
    await tx`insert into public.exceptions ${tx({
      date,
      member_id: memberId,
      kind,
      memo,
      contacted_at: contactedAt,
      created_by: captain.id,
      created_at: now,
    })} on conflict (date, member_id) where kind = 'join' do nothing`;
  });
  return {};
}

export async function deleteException({ sql, userId }: RequestContext, params: Params) {
  const id = uuidParam(params, 'exceptionId');
  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    await tx`delete from public.exceptions where id = ${id}`;
  });
  return {};
}

/** 指定した日の出欠を判定し直す。 */
export async function rejudge({ sql, userId, now }: RequestContext, params: Params) {
  const date = stringParam(params, 'date');
  if (!isPracticeDate(date)) throw new AppError('日付が正しくありません。');
  if (date > toPracticeDate(now)) throw new AppError('先の日付は判定できません。');

  const count = await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    return judgeDate(tx, { date, now, memberIds: null });
  });
  return { count };
}

/**
 * 手動判定で上書きする。自動判定は計算し直さず、最終判定に合わせて自動の罰だけを直す。
 * 過去の日を、今のコマ表で判定し直してしまわないため。
 */
export async function setManualJudgement({ sql, userId, now }: RequestContext, params: Params) {
  const date = stringParam(params, 'date');
  if (!isPracticeDate(date)) throw new AppError('日付が正しくありません。');
  const memberId = uuidParam(params, 'memberId');
  const input = validateManualJudgement(params);
  if (!input.ok) throw new AppError(input.message);
  const { judgement, reason } = input.value;

  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    await tx`select 1 from public.members where id = ${memberId} for update`;
    const [row] = await tx<{ result: Judgement }[]>`
      update public.attendance
      set manual_result = ${judgement}, manual_reason = ${reason}, updated_at = ${now}
      where practice_date = ${date} and member_id = ${memberId}
      returning final_result as result`;
    if (!row) throw new AppError('出欠一覧にありません。先にこの日を判定してください。');
    await syncAutoPenalties(tx, date, [{ memberId, result: row.result }]);
  });
  return {};
}
