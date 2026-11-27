// その日だけのコマ変更の申請（本人）。承認・却下は連絡と同じ操作を使う
import {
  decideKomaRequest,
  KOMA_CHANGE_KINDS,
  toPracticeDate,
  type KomaRequestInput,
} from '../../../../packages/core/src/index.ts';
import { requireEnrolledMember, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { stringParam, type Params } from '../params.ts';
import { homeSnapshot, loadNoticeContext } from '../store.ts';

/** 申請を保存するか取り消す。出し直しは、前の申請と入れ替える。出欠の判定は変えない。 */
async function changeRequest({ sql, userId, now }: RequestContext, input: KomaRequestInput) {
  await inTransaction(sql, async (tx) => {
    const member = await requireEnrolledMember(tx, userId);
    const decision = decideKomaRequest(await loadNoticeContext(tx, member, now), input);
    if (!decision.ok) throw new AppError(decision.message);
    if (decision.change === 'none') return;

    // 申請だけを消す。主将が入力した臨時変更は残す
    await tx`delete from public.exceptions
      where date = ${input.date} and member_id = ${member.id} and approval is not null
        and kind in ${tx([...KOMA_CHANGE_KINDS])}`;
    if (decision.change !== 'save') return;

    await tx`insert into public.exceptions ${tx({
      date: input.date,
      member_id: member.id,
      kind: decision.kind,
      memo: decision.reason,
      contacted_at: now,
      approval: 'pending',
      base_part: decision.base.part,
      base_deadline: decision.base.deadline,
      created_by: member.id,
      created_at: now,
    })}`;
  });
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}

export const submitKomaChange = (context: RequestContext, params: Params) =>
  changeRequest(context, {
    action: 'submit',
    date: stringParam(params, 'date'),
    kind: params['kind'],
    reason: stringParam(params, 'reason'),
  });

export const cancelKomaChange = (context: RequestContext, params: Params) =>
  changeRequest(context, { action: 'cancel', date: stringParam(params, 'date') });
