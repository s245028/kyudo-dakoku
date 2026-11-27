// 罰の統計
import type { PracticeDate } from './date.ts';
import { summarizePenalty, type PenaltyTask } from './penalty.ts';
import { isWithin, splitPeriod, type Bucket, type BucketUnit, type StatsPeriod } from './stats.ts';

/** 集計のもとになる罰1件 */
export type PenaltyRecord = {
  id: string;
  memberId: string;
  date: PracticeDate;
  reason: string;
  baseCount: number;
  countedFrom: PracticeDate | null;
  /** つけ間違いとして取り消した */
  canceled: boolean;
  /** 残りがなくなった */
  completed: boolean;
  tasks: readonly PenaltyTask[];
};

export type PenaltyAmounts = {
  /** 期間内の日付の罰の、基本の数 */
  added: number;
  /** 期間内に消化した数。期間より前の罰の分も含む */
  done: number;
  /** 今日の時点の残り。期間に関係なく、倍になった分を含む */
  remaining: number;
};

/** 罰1件ぶんの内訳 */
export type PenaltyDetail = PenaltyAmounts & {
  id: string;
  date: PracticeDate;
  reason: string;
  baseCount: number;
};

export type PenaltyStats = {
  totals: PenaltyAmounts;
  unit: BucketUnit;
  trend: (Bucket & { added: number; done: number })[];
  /** つけた数のある理由。多い順 */
  byReason: { reason: string; added: number }[];
  /** 数のある部員。内訳は日付の古い順 */
  byMember: (PenaltyAmounts & { memberId: string; details: PenaltyDetail[] })[];
};

function sum(items: readonly PenaltyAmounts[]): PenaltyAmounts {
  const total = { added: 0, done: 0, remaining: 0 };
  for (const { added, done, remaining } of items) {
    total.added += added;
    total.done += done;
    total.remaining += remaining;
  }
  return total;
}

const completedIn = (range: StatsPeriod, tasks: readonly PenaltyTask[]) =>
  tasks.filter((task) => task.completedOn !== null && isWithin(task.completedOn, range)).length;

/** 期間内につけた数と消化した数。`records` に取り消した罰を含めない */
function countIn(records: readonly PenaltyRecord[], range: StatsPeriod) {
  return {
    added: records
      .filter((record) => isWithin(record.date, range))
      .reduce((total, record) => total + record.baseCount, 0),
    done: records.reduce((total, record) => total + completedIn(range, record.tasks), 0),
  };
}

/** 比べる期間の数。その頃の記録がまだなければ null（0個とは区別する）。 */
export function previousPenaltyAmounts(
  records: readonly PenaltyRecord[],
  period: StatsPeriod,
): Pick<PenaltyAmounts, 'added' | 'done'> | null {
  const kept = records.filter((record) => !record.canceled);
  if (!kept.some((record) => record.date <= period.to)) return null;
  return countIn(kept, period);
}

/** 期間を指定した罰の統計。取り消した罰は数えない。 */
export function summarizePenaltyStats(input: {
  records: readonly PenaltyRecord[];
  period: StatsPeriod;
  today: PracticeDate;
  doublingDays: number;
}): PenaltyStats {
  const { period, today, doublingDays } = input;
  const records = input.records.filter((record) => !record.canceled);

  const details = records
    .map((record) => ({
      id: record.id,
      memberId: record.memberId,
      date: record.date,
      reason: record.reason,
      baseCount: record.baseCount,
      added: isWithin(record.date, period) ? record.baseCount : 0,
      done: completedIn(period, record.tasks),
      remaining: record.completed
        ? 0
        : summarizePenalty({ ...record, today, doublingDays }).remaining,
    }))
    .filter((detail) => detail.added || detail.done || detail.remaining)
    .sort((a, b) => a.date.localeCompare(b.date));

  const { unit, buckets } = splitPeriod(period);
  const trend = buckets.map((bucket) => ({ ...bucket, ...countIn(records, bucket) }));

  const reasons = new Map<string, number>();
  for (const { reason, added } of details) {
    if (added) reasons.set(reason, (reasons.get(reason) ?? 0) + added);
  }
  const members = new Map<string, PenaltyDetail[]>();
  for (const { memberId, ...detail } of details) {
    members.set(memberId, [...(members.get(memberId) ?? []), detail]);
  }

  return {
    totals: sum(details),
    unit,
    trend,
    byReason: [...reasons]
      .map(([reason, added]) => ({ reason, added }))
      .sort((a, b) => b.added - a.added),
    byMember: [...members].map(([memberId, own]) => ({ memberId, ...sum(own), details: own })),
  };
}
