// 欠席・遅刻の連絡（本人）と、承認・却下（主将）
import {
  decideNotice,
  NOTICE_KINDS,
  toPracticeDate,
  validateNoticeReview,
  type NoticeRequest,
} from '../../../../packages/core/src/index.ts';
import { requireCaptain, requireEnrolledMember, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { judgeDate } from '../judge.ts';
import { stringParam, uuidParam, type Params } from '../params.ts';
import { homeSnapshot, loadNoticeContext } from '../store.ts';

/**
 * 連絡を保存するか取り消す。出し直しは、前の連絡と入れ替える。
 * 出欠の判定は変えない（入室したときか、夜の処理で判定する）。
 */
async function changeNotice({ sql, userId, now }: RequestContext, request: NoticeRequest) {
  const today = toPracticeDate(now);

  await inTransaction(sql, async (tx) => {
    const member = await requireEnrolledMember(tx, userId);
    const decision = decideNotice(await loadNoticeContext(tx, member, now), request);
    if (!decision.ok) throw new AppError(decision.message);
    if (decision.change === 'none') return;

    // 本人が出した連絡だけを消す
    await tx`delete from public.exceptions
      where date = ${request.date} and member_id = ${member.id} and created_by = ${member.id}
        and kind in ${tx([...NOTICE_KINDS])}`;
    if (decision.change !== 'save') return;

    await tx`insert into public.exceptions ${tx({
      date: request.date,
      member_id: member.id,
      kind: decision.kind,
      memo: decision.reason,
      contacted_at: now,
      approval: decision.approval,
      created_by: member.id,
      created_at: now,
    })}`;
  });
  return { home: await homeSnapshot(sql, userId, today) };
}

export const submitNotice = (context: RequestContext, params: Params) =>
  changeNotice(context, {
    action: 'submit',
    date: stringParam(params, 'date'),
    kind: params['kind'],
    reason: stringParam(params, 'reason'),
  });

export const cancelNotice = (context: RequestContext, params: Params) =>
  changeNotice(context, { action: 'cancel', date: stringParam(params, 'date') });

/**
 * 承認か却下をする。あとから変えることもできる。
 * 今日までの日は、その人だけを判定し直す。過去の日は、記録した集合時刻のまま判定する。
 */
export async function reviewNotice({ sql, userId, now }: RequestContext, params: Params) {
  const id = uuidParam(params, 'exceptionId');
  const input = validateNoticeReview(params);
  if (!input.ok) throw new AppError(input.message);
  const { approval, rejectionReason } = input.value;
  const today = toPracticeDate(now);

  await inTransaction(sql, async (tx) => {
    const reviewer = await requireCaptain(tx, userId);
    // 打刻や本人の出し直しと重ならないよう、部員を先にロックする
    await tx`select 1 from public.members
      where id = (select member_id from public.exceptions where id = ${id}) for update`;
    const [notice] = await tx<{ date: string; memberId: string }[]>`
      update public.exceptions
      set approval = ${approval}, rejection_reason = ${rejectionReason},
        reviewed_at = ${now}, reviewed_by = ${reviewer.id}
      where id = ${id} and approval is not null
      returning date::text, member_id as "memberId"`;
    if (!notice) {
      throw new AppError(
        '承認の対象の連絡・申請がありません。本人が取り消したか、出し直しています。',
      );
    }
    if (notice.date <= today) {
      await judgeDate(tx, {
        date: notice.date,
        now,
        memberIds: [notice.memberId],
        keepRecordedPlan: notice.date < today,
      });
    }
  });
  return { home: await homeSnapshot(sql, userId, today) };
}
