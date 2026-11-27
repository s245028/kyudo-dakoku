import { addDays, daysBetween, isPracticeDate, type PracticeDate } from './date.ts';
import type { Judgement } from './attendance.ts';
import { invalid, type Validated } from './validation.ts';

/** 判定によって自動でつく罰の理由。罰の種類（DB の `penalty_types`）の名前と一致させる。 */
export const AUTO_PENALTY_REASONS: Partial<Record<Judgement, string>> = {
  late: '遅刻',
  late_notice_overdue: '遅刻（連絡遅れ）',
  absent_unexcused: '無断欠席',
  absent_notice_overdue: '欠席（連絡遅れ）',
};

/** メモを必須にする理由 */
export const OTHER_PENALTY_REASON = 'その他';

export const TASK_CONTENT_MAX_LENGTH = 60;
export const PENALTY_MEMO_MAX_LENGTH = 200;
const TASK_SUGGESTION_LIMIT = 30;

export type PenaltyType = {
  reason: string;
  baseCount: number;
  assignedBy: 'auto' | 'officer';
  description: string;
};

export const DEFAULT_PENALTY_TYPES: readonly PenaltyType[] = [
  {
    reason: '遅刻',
    baseCount: 1,
    assignedBy: 'auto',
    description: '集合時間に遅れて入室し、事前の連絡がない',
  },
  {
    reason: '遅刻（連絡遅れ）',
    baseCount: 1,
    assignedBy: 'auto',
    description: '遅刻の連絡が締め切りを過ぎていた',
  },
  {
    reason: '無断欠席',
    baseCount: 1,
    assignedBy: 'auto',
    description: '入室の記録がなく、欠席の連絡もない',
  },
  {
    reason: '欠席（連絡遅れ）',
    baseCount: 1,
    assignedBy: 'auto',
    description: '欠席の連絡が締め切りを過ぎていた',
  },
  {
    reason: '私物の出しっぱなし',
    baseCount: 1,
    assignedBy: 'officer',
    description: '道場に私物を置いたままにした',
  },
  {
    reason: OTHER_PENALTY_REASON,
    baseCount: 1,
    assignedBy: 'officer',
    description: '上にない罰。メモに内容を書く',
  },
];

export type PenaltyCount = {
  /** 残っている罰の数。0 なら消化済み */
  remaining: number;
  /** 消化した数 */
  paid: number;
  /** 次に2倍になるまでの日数 */
  daysToDouble: number;
};

/**
 * 罰の残りの数を計算する。残っている数だけが、ついた日から `doublingDays` 日ごとに2倍になる。
 * 倍になる日の前日までに消化した分は、倍にする前に差し引く。
 */
export function countPenalty(input: {
  date: PracticeDate;
  baseCount: number;
  /** やることを消化した日。1件が罰1個 */
  completedOn: readonly PracticeDate[];
  today: PracticeDate;
  doublingDays: number;
}): PenaltyCount {
  const { date, baseCount, today, doublingDays } = input;
  if (!Number.isInteger(doublingDays) || doublingDays < 1) {
    throw new RangeError(`倍になる日数が正しくありません: ${doublingDays}`);
  }
  const completedOn = [...input.completedOn].sort();
  const elapsed = Math.max(0, daysBetween(date, today));
  let remaining = baseCount;
  let settled = 0;

  for (let period = 1; period <= Math.floor(elapsed / doublingDays); period++) {
    const doublesOn = addDays(date, period * doublingDays);
    while (settled < completedOn.length && completedOn[settled]! < doublesOn) {
      remaining -= 1;
      settled += 1;
    }
    if (remaining <= 0) break;
    remaining *= 2;
  }
  remaining -= completedOn.length - settled;

  return {
    remaining: Math.max(0, remaining),
    paid: completedOn.length,
    daysToDouble: doublingDays - (elapsed % doublingDays),
  };
}

/** まだ「やること」を割り当てていない罰の数。 */
export function unassignedCount(remaining: number, openTaskCount: number): number {
  return Math.max(0, remaining - openTaskCount);
}

export type PenaltyTask = {
  id: string;
  content: string;
  /** 消化した日。未消化なら null */
  completedOn: PracticeDate | null;
};

export type PenaltyState = PenaltyCount & {
  /** まだ消化していないやること */
  openTasks: PenaltyTask[];
  /** やることを割り当てていない罰の数 */
  unassigned: number;
};

/** 罰1件の、今日時点の状態。`countedFrom` があれば、倍になる日数はその日から数える。 */
export function summarizePenalty(input: {
  date: PracticeDate;
  countedFrom?: PracticeDate | null;
  baseCount: number;
  tasks: readonly PenaltyTask[];
  today: PracticeDate;
  doublingDays: number;
}): PenaltyState {
  const completedOn = input.tasks.flatMap((task) => task.completedOn ?? []);
  const count = countPenalty({ ...input, date: input.countedFrom ?? input.date, completedOn });
  const openTasks = input.tasks.filter((task) => task.completedOn === null);
  return { ...count, openTasks, unassigned: unassignedCount(count.remaining, openTasks.length) };
}

/**
 * 自分の罰は、消化も取り消しもできない（ほかの副務に依頼する）。管理者は除く。
 * できない理由を返す。できるなら null。
 */
export function ownPenaltyRefusal(input: {
  /** 操作する人。管理者ログインは部員ではないので null */
  actorId: string | null;
  actorIsAdmin: boolean;
  ownerId: string;
}): string | null {
  const { actorId, actorIsAdmin, ownerId } = input;
  if (actorIsAdmin || actorId !== ownerId) return null;
  return '自分の罰の消化と取り消しはできません。ほかの副務に依頼してください。';
}

/** つけ間違いとして取り消せるのは、まだ1個も消化していない罰だけ。 */
export function cancelRefusal(penalty: { completed: boolean; paid: number }): string | null {
  if (penalty.paid > 0) return '消化した分がある罰は取り消せません。';
  if (penalty.completed) return 'この罰は、もう残っていません。画面を開き直してください。';
  return null;
}

export function cleanTaskContent(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, TASK_CONTENT_MAX_LENGTH);
}

/** これまでに割り当てた「やること」を、新しい順・重複なしで返す。引数は新しい順。 */
export function taskSuggestions(contentsNewestFirst: readonly string[]): string[] {
  return [...new Set(contentsNewestFirst.filter(Boolean))].slice(0, TASK_SUGGESTION_LIMIT);
}

export type NewPenalty = {
  reason: string;
  baseCount: number;
  date: PracticeDate;
  memo: string;
  contents: string[];
};

/** 副務が罰をつけるときの入力を確かめる。基本の数ぶんの「やること」が必須。 */
export function validateNewPenalty(input: {
  reason: string;
  date: string;
  memo: string;
  contents: readonly string[];
  types: readonly PenaltyType[];
}): Validated<NewPenalty> {
  const type = input.types.find((candidate) => candidate.reason === input.reason.trim());
  if (!type) return invalid('罰の理由を選んでください。');
  if (!isPracticeDate(input.date)) return invalid('日付が正しくありません。');

  const memo = input.memo.trim().slice(0, PENALTY_MEMO_MAX_LENGTH);
  if (type.reason === OTHER_PENALTY_REASON && !memo) {
    return invalid('「その他」のときはメモに内容を書いてください。');
  }
  const contents = input.contents.map(cleanTaskContent).filter(Boolean);
  if (contents.length !== type.baseCount) {
    return invalid(`罰${type.baseCount}個ぶんの「やること」をすべて入力してください。`);
  }
  return {
    ok: true,
    value: { reason: type.reason, baseCount: type.baseCount, date: input.date, memo, contents },
  };
}
