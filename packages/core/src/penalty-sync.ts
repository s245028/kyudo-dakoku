import type { PracticeDate } from './date.ts';
import type { Judgement } from './attendance.ts';
import { AUTO_PENALTY_REASONS, type PenaltyType } from './penalty.ts';

export function autoPenaltyKey(date: PracticeDate, memberId: string): string {
  return `auto|${date}|${memberId}`;
}

export type ExistingAutoPenalty = {
  id: string;
  autoKey: string;
  reason: string;
  baseCount: number;
  /** やることを割り当て済み、または消化済み。判定が変わっても変えない */
  locked: boolean;
};

export type AutoPenalty = {
  autoKey: string;
  memberId: string;
  date: PracticeDate;
  reason: string;
  baseCount: number;
};

export type PenaltyChanges = {
  create: AutoPenalty[];
  update: { id: string; reason: string; baseCount: number }[];
  remove: string[];
};

/**
 * その日の自動の罰を、最終判定に合わせるための変更を返す。
 * 判定し直した部員の分だけを渡す。割り当て済み・消化済みの罰は、判定が変わっても残す。
 */
export function planAutoPenaltySync(input: {
  date: PracticeDate;
  /** 判定し直した部員。出欠一覧に載らなくなった部員は `result` を null にする */
  judged: readonly { memberId: string; result: Judgement | null }[];
  /** `judged` の部員の、その日の自動の罰 */
  existing: readonly ExistingAutoPenalty[];
  types: readonly PenaltyType[];
}): PenaltyChanges {
  const changes: PenaltyChanges = { create: [], update: [], remove: [] };

  for (const { memberId, result } of input.judged) {
    const autoKey = autoPenaltyKey(input.date, memberId);
    const current = input.existing.find((penalty) => penalty.autoKey === autoKey);
    if (current?.locked) continue;

    const reason = result === null ? undefined : AUTO_PENALTY_REASONS[result];
    if (reason === undefined) {
      if (current) changes.remove.push(current.id);
      continue;
    }
    const baseCount = input.types.find((type) => type.reason === reason)?.baseCount ?? 1;
    if (!current) {
      changes.create.push({ autoKey, memberId, date: input.date, reason, baseCount });
    } else if (current.reason !== reason || current.baseCount !== baseCount) {
      changes.update.push({ id: current.id, reason, baseCount });
    }
  }
  return changes;
}
