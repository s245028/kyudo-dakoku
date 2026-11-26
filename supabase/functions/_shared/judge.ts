import {
  finalJudgement,
  judgeAttendance,
  planAutoPenaltySync,
  autoPenaltyKey,
  type ExistingAutoPenalty,
  type Judgement,
  type ManualJudgement,
  type PracticeDate,
} from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';
import {
  loadExceptions,
  loadKoma,
  loadPenaltyTypes,
  loadPunches,
  loadRules,
  loadSettings,
  lockJudgeableMembers,
} from './store.ts';

/**
 * その日の出欠を判定して、出欠一覧と自動の罰を合わせる。判定はここだけで行う。
 * 必ずトランザクションの中で呼ぶ。`memberIds` が null なら対象者全員。
 * 判定の対象でない部員の記録には触れない。戻り値は判定した行数。
 */
export async function judgeDate(
  tx: Sql,
  input: { date: PracticeDate; now: Date; memberIds: readonly string[] | null },
): Promise<number> {
  const { date, now, memberIds } = input;
  const members = await lockJudgeableMembers(tx, memberIds);
  if (members.length === 0) return 0;

  const ids = members.map((member) => member.id);
  const settings = await loadSettings(tx);
  const rules = await loadRules(tx);
  const koma = await loadKoma(tx, ids);
  const exceptions = await loadExceptions(tx, date);
  const punches = await loadPunches(tx, date, ids);

  const judged: { memberId: string; result: Judgement | null }[] = [];
  for (const member of members) {
    const record = judgeAttendance({
      date,
      now,
      member,
      rules,
      koma: koma.get(member.id) ?? null,
      exceptions,
      punches,
      settings,
    });
    if (!record) {
      await tx`delete from public.attendance
        where practice_date = ${date} and member_id = ${member.id}`;
      judged.push({ memberId: member.id, result: null });
      continue;
    }
    // 手動判定と修正理由は、判定し直しても残す
    const [saved] = await tx<{ manual: ManualJudgement | null }[]>`
      insert into public.attendance ${tx({
        practice_date: date,
        member_id: member.id,
        part: record.part,
        deadline: record.deadline,
        first_in: record.firstIn,
        last_out: record.lastOut,
        minutes: record.minutes,
        auto_result: record.result,
        late_minutes: record.lateMinutes,
        note: record.notes.join(' / '),
        updated_at: now,
      })}
      on conflict (practice_date, member_id) do update set
        part = excluded.part, deadline = excluded.deadline, first_in = excluded.first_in,
        last_out = excluded.last_out, minutes = excluded.minutes,
        auto_result = excluded.auto_result, late_minutes = excluded.late_minutes,
        note = excluded.note, updated_at = excluded.updated_at
      returning manual_result as manual`;
    judged.push({
      memberId: member.id,
      result: finalJudgement(record.result, saved?.manual ?? null),
    });
  }

  await syncAutoPenalties(tx, date, judged);
  return judged.filter((entry) => entry.result !== null).length;
}

async function syncAutoPenalties(
  tx: Sql,
  date: PracticeDate,
  judged: readonly { memberId: string; result: Judgement | null }[],
) {
  const keys = judged.map((entry) => autoPenaltyKey(date, entry.memberId));
  const existing = await tx<ExistingAutoPenalty[]>`
    select p.id, p.auto_key as "autoKey", p.reason, p.base_count as "baseCount",
      exists (select 1 from public.penalty_tasks t where t.penalty_id = p.id) as "hasTasks"
    from public.penalties p where p.auto_key in ${tx(keys)}`;
  const types = await loadPenaltyTypes(tx);
  const changes = planAutoPenaltySync({ date, judged, existing, types });

  if (changes.remove.length > 0) {
    await tx`delete from public.penalties where id in ${tx(changes.remove)}`;
  }
  for (const { id, reason, baseCount } of changes.update) {
    await tx`update public.penalties set reason = ${reason}, base_count = ${baseCount}
      where id = ${id}`;
  }
  for (const penalty of changes.create) {
    await tx`insert into public.penalties ${tx({
      practice_date: penalty.date,
      member_id: penalty.memberId,
      reason: penalty.reason,
      base_count: penalty.baseCount,
      auto_key: penalty.autoKey,
    })}`;
  }
}
