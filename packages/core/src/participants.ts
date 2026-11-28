// その日の練習に参加する人。立ち順を決めるときに使う
import { isAfterPractice, lateMinutesOf } from './attendance.ts';
import { toInstant, toPracticeDate, weekdayOf, type PracticeDate } from './date.ts';
import {
  isApprovedMember,
  isRetiredOn,
  type Gender,
  type Grade,
  type Member,
  type Role,
} from './member.ts';
import {
  PARTS,
  resolvePracticePlan,
  type Koma,
  type Part,
  type PracticeException,
  type PracticeRule,
} from './practice.ts';
import { validPunches, type Punch } from './punch.ts';

export type Person = Member & {
  studentNo: string;
  name: string;
  grade: Grade;
  gender: Gender;
  role: Role;
};

/** 参加予定・遅刻（予定を含む）・欠席 */
export type ParticipationStatus = 'expected' | 'late' | 'absent';

export type Participant = {
  person: Person;
  part: Part;
  status: ParticipationStatus;
  /** 連絡かコマ変更の申請が承認待ち */
  pending: boolean;
  /** いま道場にいる */
  inRoom: boolean;
  /** その人の練習が始まる時刻 */
  startsAt: Date;
};

/** 練習が始まっているのに、道場にいない。並べるときは外しておく */
export const isAway = (entry: Participant, now: Date) =>
  entry.status !== 'absent' && !entry.inRoom && now >= entry.startsAt;

/** その日に練習がある区分。参加者がいない区分も返す。練習がなければ空。 */
export function practiceParts(
  date: PracticeDate,
  rules: readonly PracticeRule[],
  exceptions: readonly PracticeException[],
): Part[] {
  const closed = exceptions.some(
    (exception) =>
      exception.date === date && exception.memberId === null && exception.kind === 'day_off',
  );
  if (closed) return [];
  const weekday = weekdayOf(date);
  return PARTS.filter((part) =>
    rules.some((rule) => rule.weekday === weekday && rule.part === part),
  );
}

/**
 * その日の参加者。現役は欠席の連絡がなければ参加、引退した人は参加を登録した人だけ。
 * 却下した連絡は、連絡がないのと同じ。
 */
export function listParticipants(input: {
  date: PracticeDate;
  members: readonly Person[];
  rules: readonly PracticeRule[];
  komaByMember: ReadonlyMap<string, Koma>;
  exceptions: readonly PracticeException[];
  punches: readonly Punch[];
}): Participant[] {
  const { date, exceptions, rules } = input;
  const punches = validPunches(input.punches).filter((punch) => toPracticeDate(punch.at) === date);

  return input.members.flatMap((person): Participant[] => {
    if (!isApprovedMember(person)) return [];
    const plan = resolvePracticePlan({
      date,
      memberId: person.id,
      rules,
      koma: input.komaByMember.get(person.id) ?? null,
      exceptions,
    });
    if (!plan || plan.exempt || (isRetiredOn(person, date) && !plan.joined)) return [];

    const mine = punches.filter((punch) => punch.memberId === person.id);
    const firstIn = mine.find((punch) => punch.kind === 'in');
    const notice = firstIn ? null : (plan.absentNotice ?? plan.lateNotice);
    let status: ParticipationStatus = 'expected';
    if (firstIn && isAfterPractice(date, plan.endTime, firstIn.at)) {
      status = 'absent';
    } else if (firstIn) {
      if (lateMinutesOf(date, plan.deadline, firstIn.at) > 0) status = 'late';
    } else if (plan.absentNotice) {
      status = 'absent';
    } else if (plan.lateNotice) {
      status = 'late';
    }
    return [
      {
        person,
        part: plan.part,
        status,
        pending: notice?.approval === 'pending' || plan.komaRequestPending,
        inRoom: mine.at(-1)?.kind === 'in',
        startsAt: toInstant(date, plan.startTime),
      },
    ];
  });
}
