import { toInstant, toPracticeDate, type ClockTime, type PracticeDate } from './date.ts';
import { isApprovedMember, isRetiredOn, type Member } from './member.ts';
import {
  isKomaRequest,
  resolvePracticePlan,
  type Koma,
  type Notice,
  type Part,
  type PracticeException,
  type PlanTime,
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
export const JUDGEMENTS = [
  ...MANUAL_JUDGEMENTS,
  // 連絡の承認を待っている間は、罰をつけない
  'late_pending',
  'absent_pending',
  'not_arrived',
  'unregistered',
] as const;
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
  late_pending: '遅刻（承認待ち）',
  absent_pending: '欠席（承認待ち）',
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

/** 締め切りに間に合うか。分の単位で比べる。 */
export function isWithinNoticeLimit(instant: Date, limit: Date): boolean {
  return Math.floor(instant.getTime() / 60_000) * 60_000 <= limit.getTime();
}

/**
 * 連絡がある場合の判定。締め切り後なら連絡遅れ、締め切り内で承認待ちなら保留。
 * 連絡日時が未入力なら締め切り内として備考に残す。
 */
function judgeNotice(
  notice: Notice,
  limit: Date,
  notes: string[],
  kind: 'late' | 'absent',
): Judgement {
  if (notice.contactedAt === null) {
    notes.push('連絡日時が未入力（締め切り内として扱った）');
  } else if (!isWithinNoticeLimit(notice.contactedAt, limit)) {
    return `${kind}_notice_overdue`;
  }
  return notice.approval === 'pending' ? `${kind}_pending` : `${kind}_notified`;
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
    return done(judgeNotice(notice, limit, notes, 'late'), late);
  }

  const settled = isAbsenceSettled(date, now, settings.autoCheckoutTime);
  const notice = plan.absentNotice ?? plan.lateNotice;
  if (!notice) return done(settled ? 'absent_unexcused' : 'not_arrived');
  // 遅刻の連絡だけなら、欠席が確定するまで到着を待つ
  if (!plan.absentNotice && !settled) return done('not_arrived');
  return done(judgeNotice(notice, limit, notes, 'absent'));
}

/** コマ変更の申請の結果しだいで消える罰は、承認か却下まで保留する */
const HELD_FOR_KOMA_REQUEST: Partial<Record<Judgement, Judgement>> = {
  late: 'late_pending',
  late_notice_overdue: 'late_pending',
  absent_unexcused: 'absent_pending',
  absent_notice_overdue: 'absent_pending',
};

/**
 * 判定に使う区分と集合時刻。過去の日を判定し直すときは、記録した時刻のままにする。
 * コマ変更の申請があれば、承認なら申請の時刻、それ以外は申請する前の時刻にする。
 */
function planFor(
  resolved: PracticePlan,
  recorded: PlanTime | null | undefined,
  mine: readonly PracticeException[],
): PracticePlan {
  if (!recorded) return resolved;
  const requests = mine.filter(isKomaRequest);
  if (requests.some((request) => request.approval === 'approved')) return resolved;
  const base = requests.findLast((request) => request.basePlan)?.basePlan;
  return { ...resolved, ...(base ?? recorded) };
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
  /** 記録済みの区分と集合時刻。過去の日を、今のコマ表で変えずに判定し直すときに渡す */
  recorded?: PlanTime | null;
};

/**
 * その日の出欠を判定する。出欠一覧に載せない場合は null
 * （対象外の部員、練習日でない、引退した人が参加登録せず来てもいない）。
 */
export function judgeAttendance(input: JudgementInput): AttendanceRecord | null {
  const { date, now, member, settings } = input;
  if (!isApprovedMember(member)) return null;

  const resolved = resolvePracticePlan({ ...input, memberId: member.id });
  if (!resolved) return null;
  const plan = planFor(
    resolved,
    input.recorded,
    input.exceptions.filter(
      (exception) => exception.date === date && exception.memberId === member.id,
    ),
  );

  const mine = validPunches(input.punches).filter(
    (punch) => punch.memberId === member.id && toPracticeDate(punch.at) === date,
  );
  const judged = !isRetiredOn(member, date) || plan.joined;
  if (!judged && mine.length === 0) return null;

  const firstIn = mine.find((punch) => punch.kind === 'in')?.at ?? null;
  const lastOut = mine.findLast((punch) => punch.kind !== 'in')?.at ?? null;
  const decision = decideResult({ date, plan, judged, firstIn, now, settings });
  const held = plan.komaRequestPending ? HELD_FOR_KOMA_REQUEST[decision.result] : undefined;
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
    result: held ?? decision.result,
    lateMinutes: decision.lateMinutes,
    notes,
  };
}

/** 手動判定があればそちらを最終判定にする。 */
export function finalJudgement(auto: Judgement, manual: ManualJudgement | null): Judgement {
  return manual ?? auto;
}
