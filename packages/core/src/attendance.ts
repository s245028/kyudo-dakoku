import { toInstant, toPracticeDate, type ClockTime, type PracticeDate } from './date.ts';
import { isEnrolled, isRetiredOn, type Member } from './member.ts';
import {
  resolvePracticePlan,
  type Koma,
  type Notice,
  type Part,
  type PracticeException,
  type PracticePlan,
  type PracticeRule,
} from './practice.ts';
import { validPunches, type Punch } from './punch.ts';
import type { Settings } from './settings.ts';

/** 主将が手動判定に選べる値 */
export const MANUAL_JUDGEMENTS = [
  'present',
  'late',
  'late_notified',
  'late_notice_overdue',
  'absent_unexcused',
  'absent_notified',
  'absent_notice_overdue',
  'exempt',
] as const;
export const JUDGEMENTS = [...MANUAL_JUDGEMENTS, 'not_arrived', 'unregistered'] as const;
export type ManualJudgement = (typeof MANUAL_JUDGEMENTS)[number];
export type Judgement = (typeof JUDGEMENTS)[number];

export const JUDGEMENT_LABELS: Record<Judgement, string> = {
  present: '出席',
  late: '遅刻',
  late_notified: '遅刻（連絡済）',
  late_notice_overdue: '遅刻（連絡遅れ）',
  absent_unexcused: '無断欠席',
  absent_notified: '欠席（連絡済）',
  absent_notice_overdue: '欠席（連絡遅れ）',
  exempt: '対象外',
  not_arrived: '未到着',
  unregistered: '参加（登録なし）',
};

export type AttendanceRecord = {
  date: PracticeDate;
  memberId: string;
  part: Part;
  deadline: ClockTime;
  firstIn: Date | null;
  lastOut: Date | null;
  /** 在室時間（分） */
  minutes: number;
  result: Judgement;
  /** 遅刻していなければ null */
  lateMinutes: number | null;
  notes: string[];
};

export type JudgementSettings = Pick<Settings, 'noticeLeadMinutes' | 'autoCheckoutTime'>;

const wholeSeconds = (instant: Date) => Math.floor(instant.getTime() / 1000);

/** 集合時刻を1秒でも過ぎていれば遅刻。分は切り上げる。遅刻でなければ 0。 */
export function lateMinutesOf(date: PracticeDate, deadline: ClockTime, enteredAt: Date): number {
  const seconds = wholeSeconds(enteredAt) - wholeSeconds(toInstant(date, deadline));
  return seconds > 0 ? Math.ceil(seconds / 60) : 0;
}

/** 欠席・遅刻の連絡や、参加の取り消しができる最後の瞬間。 */
export function noticeDeadlineOf(
  date: PracticeDate,
  deadline: ClockTime,
  leadMinutes: number,
): Date {
  return new Date(toInstant(date, deadline).getTime() - leadMinutes * 60_000);
}

/** 連絡が締め切り内か。連絡日時は分の単位で比べ、未入力なら締め切り内として備考に残す。 */
function isNoticeOnTime(notice: Notice, limit: Date, notes: string[]): boolean {
  if (notice.contactedAt === null) {
    notes.push('連絡日時が未入力（締め切り内として扱った）');
    return true;
  }
  const contactedMinute = Math.floor(notice.contactedAt.getTime() / 60_000) * 60_000;
  return contactedMinute <= limit.getTime();
}

/** その日の自動退室の時刻を過ぎて、来ていない人の欠席が確定したか。 */
function isAbsenceSettled(date: PracticeDate, now: Date, autoCheckoutTime: ClockTime): boolean {
  return now.getTime() >= toInstant(date, autoCheckoutTime).getTime();
}

function decideResult(input: {
  date: PracticeDate;
  plan: PracticePlan;
  judged: boolean;
  firstIn: Date | null;
  now: Date;
  settings: JudgementSettings;
}): { result: Judgement; lateMinutes: number | null; notes: string[] } {
  const { date, plan, judged, firstIn, now, settings } = input;
  const notes: string[] = [];
  const done = (result: Judgement, lateMinutes: number | null = null) => ({
    result,
    lateMinutes,
    notes,
  });

  if (plan.exempt) return done('exempt');
  if (!judged) {
    notes.push('引退後。参加登録がないので判定しない');
    return done('unregistered');
  }

  const limit = noticeDeadlineOf(date, plan.deadline, settings.noticeLeadMinutes);

  if (firstIn) {
    const late = lateMinutesOf(date, plan.deadline, firstIn);
    if (late === 0) return done('present');
    const notice = plan.lateNotice ?? plan.absentNotice;
    if (!notice) return done('late', late);
    return done(
      isNoticeOnTime(notice, limit, notes) ? 'late_notified' : 'late_notice_overdue',
      late,
    );
  }

  const settled = isAbsenceSettled(date, now, settings.autoCheckoutTime);
  const notice = plan.absentNotice ?? plan.lateNotice;
  if (!notice) return done(settled ? 'absent_unexcused' : 'not_arrived');
  // 遅刻の連絡だけなら、欠席が確定するまで到着を待つ
  if (!plan.absentNotice && !settled) return done('not_arrived');
  return done(isNoticeOnTime(notice, limit, notes) ? 'absent_notified' : 'absent_notice_overdue');
}

/** 入室から退室までの合計。当日の入室中は、今までの時間を足す。 */
function minutesInRoom(punches: readonly Punch[], openUntil: Date | null): number {
  let total = 0;
  let enteredAt: Date | null = null;
  for (const punch of punches) {
    if (punch.kind === 'in') {
      enteredAt ??= punch.at;
    } else if (enteredAt) {
      total += wholeSeconds(punch.at) - wholeSeconds(enteredAt);
      enteredAt = null;
    }
  }
  if (enteredAt && openUntil) {
    total += Math.max(0, wholeSeconds(openUntil) - wholeSeconds(enteredAt));
  }
  return Math.round(total / 60);
}

export type JudgementInput = {
  date: PracticeDate;
  now: Date;
  member: Member;
  rules: readonly PracticeRule[];
  koma: Koma | null;
  /** その日の臨時変更。ほかの日や他人の分が混ざっていてもよい */
  exceptions: readonly PracticeException[];
  /** その日の打刻。他人の分が混ざっていてもよい */
  punches: readonly Punch[];
  settings: JudgementSettings;
};

/** その人を判定の対象にするか。対象外の人の過去の記録には触れない。 */
export function isJudgeable(member: Pick<Member, 'status' | 'approved'>): boolean {
  return member.approved && isEnrolled(member.status);
}

/**
 * その日の出欠を判定する。出欠一覧に載せない場合は null
 * （対象外の部員、練習日でない、引退した人が参加登録せず来てもいない）。
 */
export function judgeAttendance(input: JudgementInput): AttendanceRecord | null {
  const { date, now, member, settings } = input;
  if (!isJudgeable(member)) return null;

  const plan = resolvePracticePlan({ ...input, memberId: member.id });
  if (!plan) return null;

  const mine = validPunches(input.punches).filter(
    (punch) => punch.memberId === member.id && toPracticeDate(punch.at) === date,
  );
  const judged = !isRetiredOn(member, date) || plan.joined;
  if (!judged && mine.length === 0) return null;

  const firstIn = mine.find((punch) => punch.kind === 'in')?.at ?? null;
  const lastOut = mine.findLast((punch) => punch.kind !== 'in')?.at ?? null;
  const decision = decideResult({ date, plan, judged, firstIn, now, settings });
  const notes = [...plan.notes, ...decision.notes];
  if (mine.some((punch) => punch.kind === 'auto_out')) notes.push('退室打刻なし');

  return {
    date,
    memberId: member.id,
    part: plan.part,
    deadline: plan.deadline,
    firstIn,
    lastOut,
    minutes: minutesInRoom(mine, toPracticeDate(now) === date ? now : null),
    result: decision.result,
    lateMinutes: decision.lateMinutes,
    notes,
  };
}

/** 手動判定があればそちらを最終判定にする。 */
export function finalJudgement(auto: Judgement, manual: ManualJudgement | null): Judgement {
  return manual ?? auto;
}
