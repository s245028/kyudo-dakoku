// 設定・練習ルール・罰の種類（主将）
import {
  toPracticeDate,
  validatePenaltyType,
  validatePracticeRule,
  validateSettings,
} from '../../../../packages/core/src/index.ts';
import { requireCaptain, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { objectParam, uuidParam, type Params } from '../params.ts';
import { homeSnapshot } from '../store.ts';

export async function updateSettings({ sql, userId, now }: RequestContext, params: Params) {
  const input = validateSettings(objectParam(params, 'settings'));
  if (!input.ok) throw new AppError(input.message);

  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    for (const [key, value] of Object.entries(input.value)) {
      // 値の null は、SQL の null ではなく JSON の null として保存する
      await tx`update public.settings
        set value = coalesce(${value === null ? null : tx.json(value)}, 'null'::jsonb)
        where key = ${key}`;
    }
  });
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}

/** 曜日と条件が同じルールがあれば置き換える。 */
export async function saveRule({ sql, userId }: RequestContext, params: Params) {
  const input = validatePracticeRule(objectParam(params, 'rule'));
  if (!input.ok) throw new AppError(input.message);
  const { weekday, condition, part, deadline, startTime, endTime } = input.value;

  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    await tx`insert into public.practice_rules ${tx({
      weekday,
      condition,
      part,
      deadline,
      start_time: startTime,
      end_time: endTime,
    })}
    on conflict (weekday, condition) do update set
      part = excluded.part, deadline = excluded.deadline, start_time = excluded.start_time,
      end_time = excluded.end_time`;
  });
  return {};
}

export async function deleteRule({ sql, userId }: RequestContext, params: Params) {
  const id = uuidParam(params, 'ruleId');
  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    await tx`delete from public.practice_rules where id = ${id}`;
  });
  return {};
}

/** 罰の種類を追加するか、基本の数と説明を変える。追加した種類は副務・主将がつける。 */
export async function savePenaltyType({ sql, userId }: RequestContext, params: Params) {
  const input = validatePenaltyType(objectParam(params, 'type'));
  if (!input.ok) throw new AppError(input.message);
  const { reason, baseCount, description } = input.value;

  await inTransaction(sql, async (tx) => {
    await requireCaptain(tx, userId);
    await tx`insert into public.penalty_types ${tx({
      reason,
      base_count: baseCount,
      assigned_by: 'officer',
      description,
    })}
    on conflict (reason) do update set
      base_count = excluded.base_count,
      description = coalesce(nullif(excluded.description, ''), penalty_types.description)`;
  });
  return {};
}
