// 立ち順の保存と削除（4役と管理者）。扱うのは当日分だけ
import {
  isLineupStale,
  LINEUP_CONFLICT_MESSAGE,
  PARTS,
  toPracticeDate,
  validateLineup,
  type Part,
} from '../../../../packages/core/src/index.ts';
import { requireLineupEditor, type RequestContext } from '../context.ts';
import { inTransaction, type Sql } from '../db.ts';
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

/**
 * その区分の立ち順を、ほかの人と同時に変えないようにしてから、
 * 編集のもとにした内容が今も最新かを確かめる。黙って上書きしない。
 */
async function refuseStale(tx: Sql, date: string, part: Part, params: Params) {
  await tx`select pg_advisory_xact_lock(hashtext(${`lineup:${date}:${part}`}))`;
  const [current] = await tx<{ updatedAt: Date }[]>`
    select updated_at as "updatedAt" from public.lineups
    where practice_date = ${date} and part = ${part}`;
  const base = stringParam(params, 'baseUpdatedAt') || null;
  if (isLineupStale(base, current?.updatedAt.toISOString() ?? null)) {
    throw new AppError(LINEUP_CONFLICT_MESSAGE);
  }
}

export async function saveLineup({ sql, userId, now }: RequestContext, params: Params) {
  const input = validateLineup(params);
  if (!input.ok) throw new AppError(input.message);
  const { part, format, groups, published } = input.value;

  await inTransaction(sql, async (tx) => {
    const actor = await requireLineupEditor(tx, userId);
    const date = todayParam(params, now);
    await refuseStale(tx, date, part, params);
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
    await requireLineupEditor(tx, userId);
    const date = todayParam(params, now);
    await refuseStale(tx, date, part, params);
    await tx`delete from public.lineups where practice_date = ${date} and part = ${part}`;
  });
  return {};
}
