import {
  addDays,
  decideJoin,
  JOIN_DAYS_AHEAD,
  NOTICE_KINDS,
  toPracticeDate,
} from '../../../../packages/core/src/index.ts';
import { requireEnrolledMember, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { judgeDate } from '../judge.ts';
import { stringParam, type Params } from '../params.ts';
import { homeSnapshot, loadExceptions, loadKoma, loadRules, loadSettings } from '../store.ts';

/** 引退した人の参加の登録と取り消し。登録は集合時刻まで、取り消しは連絡の締め切りまで。 */
async function changeJoin(
  { sql, userId, now }: RequestContext,
  params: Params,
  action: 'join' | 'cancel',
) {
  const date = stringParam(params, 'date');
  const today = toPracticeDate(now);

  await inTransaction(sql, async (tx) => {
    const member = await requireEnrolledMember(tx, userId);
    const decision = decideJoin({
      member,
      memberId: member.id,
      date,
      action,
      now,
      rules: await loadRules(tx),
      koma: (await loadKoma(tx, [member.id])).get(member.id) ?? null,
      exceptions: await loadExceptions(tx, today, addDays(today, JOIN_DAYS_AHEAD)),
      settings: await loadSettings(tx),
    });
    if (!decision.ok) throw new AppError(decision.message);
    if (decision.change === 'none') return;

    if (decision.change === 'add') {
      await tx`insert into public.exceptions ${tx({
        date,
        member_id: member.id,
        kind: 'join',
        memo: `アプリから登録（${member.name}）`,
        contacted_at: now,
        created_by: member.id,
        created_at: now,
      })}`;
    } else {
      // 参加をやめた日の、本人が出した連絡も一緒に消す
      await tx`delete from public.exceptions
        where date = ${date} and member_id = ${member.id}
          and (kind = 'join' or (kind in ${tx([...NOTICE_KINDS])} and created_by = ${member.id}))`;
    }
    if (date === today) await judgeDate(tx, { date, now, memberIds: [member.id] });
  });
  return { home: await homeSnapshot(sql, userId, today) };
}

export const join = (context: RequestContext, params: Params) =>
  changeJoin(context, params, 'join');

export const unjoin = (context: RequestContext, params: Params) =>
  changeJoin(context, params, 'cancel');
