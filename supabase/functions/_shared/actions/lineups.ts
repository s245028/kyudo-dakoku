// 立ち順の保存と削除（主将・管理者）。扱うのは当日分だけ
import { PARTS, toPracticeDate, validateLineup } from '../../../../packages/core/src/index.ts';
import { requireCaptain, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { stringParam, type Params } from '../params.ts';

/** 画面を開いたまま日付が変わった場合に、前の日の立ち順を今日の分にしない。 */
function todayParam(params: Params, now: Date): string {
  const today = toPracticeDate(now);
  if (stringParam(params, 'date') !== today) {
    throw new AppError('日付が変わりました。画面を開き直してください。');
  }
  return today;
}

export async function saveLineup({ sql, userId, now }: RequestContext, params: Params) {
  const input = validateLineup(params);
  if (!input.ok) throw new AppError(input.message);
  const { part, format, groups, published } = input.value;

  await inTransaction(sql, async (tx) => {
    const actor = await requireCaptain(tx, userId);
    const date = todayParam(params, now);
    const ids = groups.flat();
    const found = await tx`select 1 from public.members
      where approved and status in ('active', 'retired') and id in ${tx(ids)}`;
    if (found.length !== ids.length) {
      throw new AppError('名簿にいない人が入っています。画面を開き直してください。');
    }
    const row = {
      practice_date: date,
      part,
      format,
      groups: tx.json(groups),
      published,
      updated_at: now,
      updated_by: actor.id,
    };
    await tx`insert into public.lineups ${tx(row)}
      on conflict (practice_date, part) do update set
        format = excluded.format, groups = excluded.groups, published = excluded.published,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by`;
  });
  return {};
}

export async function deleteLineup({ sql, userId, now }: RequestContext, params: Params) {
  const part = PARTS.find((candidate) => candidate === params['part']);
  if (!part) throw new AppError('立ち順の指定が正しくありません。');

  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    const date = todayParam(params, now);
    await tx`delete from public.lineups where practice_date = ${date} and part = ${part}`;
  });
  return {};
}
