// 部全体の予定（休み・休講補講・行事）と、部員ごとの予定（4役と管理者）。臨時変更の表に記録する
import {
  SCHEDULE_KINDS,
  toPracticeDate,
  validateEvent,
  validateSchedule,
} from '../../../../packages/core/src/index.ts';
import { requireScheduleEditor, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { uuidListParam, uuidParam, type Params } from '../params.ts';

export async function addSchedule({ sql, userId, now }: RequestContext, params: Params) {
  const count = await inTransaction(sql, async (tx) => {
    const actor = await requireScheduleEditor(tx, userId);
    const input = validateSchedule(params, {
      today: toPracticeDate(now),
      allowPast: actor.administers,
    });
    if (!input.ok) throw new AppError(input.message);
    const { memberId, kind, memo, dates } = input.value;
    if (memberId !== null) {
      uuidParam(params, 'memberId');
      const [target] = await tx`select 1 from public.members where id = ${memberId}`;
      if (!target) throw new AppError('部員が見つかりません。');
    }
    // 同じ日・人・内容を入れ直したときは、置き換える
    await tx`delete from public.exceptions
      where date in ${tx(dates)} and kind = ${kind} and approval is null
        and member_id is not distinct from ${memberId}::uuid`;
    await tx`insert into public.exceptions ${tx(
      dates.map((date) => ({
        date,
        member_id: memberId,
        kind,
        memo,
        created_by: actor.id,
        created_at: now,
      })),
    )}`;
    return dates.length;
  });
  return { count };
}

/** 行事を入れる。同じ日の行事は置き換える。 */
export async function saveEvent({ sql, userId, now }: RequestContext, params: Params) {
  await inTransaction(sql, async (tx) => {
    const actor = await requireScheduleEditor(tx, userId);
    const input = validateEvent(params, {
      today: toPracticeDate(now),
      allowPast: actor.administers,
    });
    if (!input.ok) throw new AppError(input.message);
    const { date, event } = input.value;
    await tx`delete from public.exceptions where date = ${date} and kind = 'event'`;
    await tx`insert into public.exceptions ${tx({
      date,
      member_id: null,
      kind: 'event',
      memo: event.memo,
      event_title: event.title,
      event_deadline: event.deadline,
      event_start_time: event.startTime,
      event_end_time: event.endTime,
      event_shots: event.shots,
      created_by: actor.id,
      created_at: now,
    })}`;
  });
  return {};
}

/** まとめて消す。部員が申請したコマ変更と、連絡・参加はここでは消せない。 */
export async function deleteSchedule({ sql, userId, now }: RequestContext, params: Params) {
  const ids = uuidListParam(params, 'ids');
  const today = toPracticeDate(now);
  await inTransaction(sql, async (tx) => {
    const actor = await requireScheduleEditor(tx, userId);
    const rows = await tx<{ date: string }[]>`
      delete from public.exceptions
      where id in ${tx(ids)} and kind in ${tx([...SCHEDULE_KINDS, 'event'])} and approval is null
      returning date::text as date`;
    // 断るときは、消した分も取り消される
    if (!actor.administers && rows.some((row) => row.date < today)) {
      throw new AppError('今日より前の予定は、主将か管理者が変えます。');
    }
  });
  return {};
}
