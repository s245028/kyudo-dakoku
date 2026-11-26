// `home()` が返す内容の型と、画面に出す値への変換。計算は packages/core を使う。
import {
  isRetiredOn,
  resolvePracticePlan,
  summarizePenalty,
  toPracticeDate,
  upcomingJoinDays,
  validPunches,
  type Gender,
  type Grade,
  type Koma,
  type MemberStatus,
  type PenaltyState,
  type PenaltyTask,
  type PracticeException,
  type PracticeRule,
  type PunchKind,
  type Role,
} from '@kyudo/core';

export type HomeMember = {
  id: string;
  studentNo: string;
  name: string;
  grade: Grade;
  gender: Gender;
  status: MemberStatus;
  role: Role;
  approved: boolean;
  retiredOn: string | null;
};

export type Penalty = {
  id: string;
  date: string;
  memberId: string;
  name: string;
  studentNo: string;
  reason: string;
  memo: string;
  baseCount: number;
  tasks: PenaltyTask[];
};

export type HomeData = {
  member: HomeMember;
  settings: {
    komaLocked: boolean;
    noticeLeadMinutes: number;
    penaltyDoublingDays: number;
    undoSeconds: number;
    requiresLocation: boolean;
  };
  rules: PracticeRule[];
  koma: Koma | null;
  exceptions: (Omit<PracticeException, 'contactedAt'> & { contactedAt: string | null })[];
  punches: { id: number; at: string; kind: PunchKind; canceledAt: string | null }[];
  penalties: Penalty[];
};

/** 登録していない端末は member が null */
export type Home = HomeData | { member: null };

export type CountedPenalty = Penalty & PenaltyState;

/** 残りのある罰だけを、今日時点の数つきで返す。順番は保つ。 */
export function countPenalties(
  penalties: readonly Penalty[],
  today: string,
  doublingDays: number,
): CountedPenalty[] {
  return penalties
    .map((penalty) => ({ ...penalty, ...summarizePenalty({ ...penalty, today, doublingDays }) }))
    .filter((penalty) => penalty.remaining > 0);
}

export function totalRemaining(penalties: readonly CountedPenalty[]): number {
  return penalties.reduce((total, penalty) => total + penalty.remaining, 0);
}

/** ホーム画面に出す、今の状態。 */
export function describeHome(home: HomeData, now: Date) {
  const today = toPracticeDate(now);
  const { member, rules, koma } = home;
  const exceptions = home.exceptions.map((exception) => ({
    ...exception,
    contactedAt: exception.contactedAt === null ? null : new Date(exception.contactedAt),
  }));
  const plan = resolvePracticePlan({
    date: today,
    memberId: member.id,
    rules,
    koma,
    exceptions,
  });
  const retired = isRetiredOn(member, today);
  const judged = plan !== null && !plan.exempt && (!retired || plan.joined);

  // 保存しておいた内容を表示するときもあるので、今日の打刻だけを見る
  const punches = validPunches(
    home.punches.map((punch) => ({
      memberId: member.id,
      kind: punch.kind,
      at: new Date(punch.at),
      canceledAt: punch.canceledAt === null ? null : new Date(punch.canceledAt),
    })),
  ).filter((punch) => toPracticeDate(punch.at) === today);
  const last = punches.at(-1);

  return {
    today,
    retired,
    /** 今日判定される場合の予定。判定されなければ null */
    plan: judged ? plan : null,
    inRoomSince: last?.kind === 'in' ? last.at : null,
    penalties: countPenalties(home.penalties, today, home.settings.penaltyDoublingDays),
    joinDays: retired
      ? upcomingJoinDays({
          memberId: member.id,
          now,
          rules,
          koma,
          exceptions,
          settings: home.settings,
        })
      : [],
  };
}

export type HomeView = ReturnType<typeof describeHome>;
