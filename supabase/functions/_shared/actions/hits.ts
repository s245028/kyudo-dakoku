// 的中の記録の保存・訂正・削除。本人と、副務・管理者
import {
  canCorrectHits,
  isApprovedMember,
  mergesIntoHistory,
  planHitChange,
  toPracticeDate,
  validateHitDate,
  validateHitEntry,
  hitEditRefusal,
  type HitContent,
  type HitEntry,
  type HitRecord,
} from '../../../../packages/core/src/index.ts';
import { isAdmin, UNREGISTERED_MESSAGE, type RequestContext } from '../context.ts';
import { inTransaction, type Sql } from '../db.ts';
import { AppError, refuseIf } from '../errors.ts';
import { stringParam, uuidParam, type Params } from '../params.ts';
import { findMemberByDevice, loadSettings } from '../store.ts';

/** 保存する人。`id` は部員の id で、管理者ログインは null */
type Writer = { id: string | null; mayRecord: boolean; canCorrect: boolean };

async function findWriter(tx: Sql, userId: string): Promise<Writer> {
  if (await isAdmin(tx, userId)) return { id: null, mayRecord: false, canCorrect: true };
  const member = await findMemberByDevice(tx, userId);
  if (!member) throw new AppError(UNREGISTERED_MESSAGE);
  return {
    id: member.id,
    mayRecord: isApprovedMember(member),
    canCorrect: canCorrectHits(member),
  };
}

function parseEntries(params: Params): HitEntry[] {
  const raw = params['entries'];
  if (!Array.isArray(raw) || raw.length === 0) throw new AppError('記録の内容が正しくありません。');
  const entries = raw.map((item) => {
    const entry = validateHitEntry(item);
    if (!entry.ok) throw new AppError(entry.message);
    return entry.value;
  });
  if (new Set(entries.map((entry) => entry.category)).size !== entries.length) {
    throw new AppError('同じ区分が2回指定されています。');
  }
  return entries;
}

type Target = { memberId: string; date: string };

const readRecords = (tx: Sql, { memberId, date }: Target) => tx<
  (HitRecord & { updatedAt: Date })[]
>`
  select category, mode, shots, hits, rows, revision, updated_at as "updatedAt"
  from public.hit_records
  where member_id = ${memberId} and practice_date = ${date} order by category`;

const contentOf = ({ mode, shots, hits, rows }: HitContent) => ({ mode, shots, hits, rows });

async function writeHistory(
  tx: Sql,
  change: Target & {
    category: string;
    before: HitContent | null;
    after: HitContent | null;
    actorId: string | null;
    now: Date;
  },
) {
  const { memberId, date, category, before, after, actorId, now } = change;
  const [latest] = await tx<
    { id: number; changedBy: string | null; changedAt: Date; hasAfter: boolean }[]
  >`select id, changed_by as "changedBy", changed_at as "changedAt",
      after is not null as "hasAfter"
    from public.hit_record_history
    where member_id = ${memberId} and practice_date = ${date} and category = ${category}
    order by id desc limit 1`;
  const asJson = (content: HitContent | null) =>
    content === null ? null : tx.json(contentOf(content));

  if (mergesIntoHistory({ latest: latest ?? null, actorId, now, deleting: after === null })) {
    await tx`update public.hit_record_history
      set after = ${asJson(after)}, changed_at = ${now} where id = ${latest!.id}`;
    return;
  }
  await tx`insert into public.hit_record_history ${tx({
    member_id: memberId,
    practice_date: date,
    category,
    before: asJson(before),
    after: asJson(after),
    changed_by: actorId,
    changed_at: now,
  })}`;
}

/**
 * 1人の1日分の記録を、区分ごとにまとめて保存する。ほかで変わった区分があれば、
 * どれも変えずに今の記録を返す。
 */
export async function saveHits({ sql, userId, now }: RequestContext, params: Params) {
  const entries = parseEntries(params);

  return inTransaction(sql, async (tx) => {
    const writer = await findWriter(tx, userId);
    const memberId =
      params['memberId'] === undefined || params['memberId'] === null
        ? writer.id
        : uuidParam(params, 'memberId');
    if (memberId === null) throw new AppError('部員を選んでください。');
    // 同じ人の記録の保存は、順に処理する
    const [member] = await tx`select 1 from public.members where id = ${memberId} for update`;
    if (!member) throw new AppError('部員が見つかりません。画面を開き直してください。');

    const settings = await loadSettings(tx);
    const date = validateHitDate(stringParam(params, 'date'), {
      startDate: settings.hitStartDate,
      today: toPracticeDate(now),
    });
    if (!date.ok) throw new AppError(date.message);
    const target = { memberId, date: date.value };
    const records = await readRecords(tx, target);

    const changes = entries.map((entry) => {
      const existing = records.find((record) => record.category === entry.category) ?? null;
      return { entry, existing, plan: planHitChange(existing, entry) };
    });
    for (const { existing, plan } of changes) {
      refuseIf(
        hitEditRefusal({
          own: writer.id === memberId,
          actorMayRecord: writer.mayRecord,
          actorCanCorrect: writer.canCorrect,
          creating: plan === 'save' && !existing,
        }),
      );
    }
    if (changes.some((change) => change.plan === 'conflict')) {
      return { conflict: true, records };
    }

    for (const { entry, existing, plan } of changes) {
      if (plan === 'noop') continue;
      const { category, content } = entry;
      if (content === null) {
        await tx`delete from public.hit_records
          where member_id = ${memberId} and practice_date = ${date.value}
            and category = ${category}`;
      } else {
        const rows = content.rows === null ? null : tx.json(content.rows);
        await tx`insert into public.hit_records
            (member_id, practice_date, category, mode, shots, hits, rows, revision,
             updated_at, updated_by)
          values (${memberId}, ${date.value}, ${category}, ${content.mode}, ${content.shots},
            ${content.hits}, ${rows}, nextval('public.hit_revision'), ${now}, ${writer.id})
          on conflict (member_id, practice_date, category) do update set
            mode = excluded.mode, shots = excluded.shots, hits = excluded.hits,
            rows = excluded.rows, revision = excluded.revision,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by`;
      }
      await writeHistory(tx, {
        ...target,
        category,
        before: existing,
        after: content,
        actorId: writer.id,
        now,
      });
    }
    return { conflict: false, records: await readRecords(tx, target) };
  });
}
