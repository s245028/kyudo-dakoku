import {
  addDays,
  isPracticeDate,
  toInstant,
  toPracticeDate,
  type ClockTime,
  type PracticeDate,
} from './date.ts';
import { noticeDeadlineOf } from './attendance.ts';
import { isEnrolled, isRetiredOn, type Member } from './member.ts';
import {
  resolvePracticePlan,
  type Koma,
  type Part,
  type PracticeException,
  type PracticeRule,
} from './practice.ts';
import type { PracticeEvent } from './event.ts';
import type { Settings } from './settings.ts';

/** 引退した人が参加を登録できる、今日から先の日数 */
export const JOIN_DAYS_AHEAD = 14;

export type JoinDay = {
  date: PracticeDate;
  part: Part;
  deadline: ClockTime;
  joined: boolean;
  canJoin: boolean;
  canCancel: boolean;
  /** 行事の日なら、その内容 */
  event: PracticeEvent | null;
};

export type JoinContext = {
  memberId: string;
  now: Date;
  rules: readonly PracticeRule[];
  koma: Koma | null;
  /** 今日から登録できる最後の日までの臨時変更 */
  exceptions: readonly PracticeException[];
  settings: Pick<Settings, 'noticeLeadMinutes'>;
};

/** これからの練習日と、参加登録の状態。登録は集合時刻まで、取り消しは連絡の締め切りまで。 */
export function upcomingJoinDays(context: JoinContext): JoinDay[] {
  const { now, settings } = context;
  const today = toPracticeDate(now);
  const days: JoinDay[] = [];

  for (let ahead = 0; ahead <= JOIN_DAYS_AHEAD; ahead++) {
    const date = addDays(today, ahead);
    const plan = resolvePracticePlan({ ...context, date });
    if (!plan || plan.exempt) continue;

    const canJoin = now <= toInstant(date, plan.deadline);
    if (!canJoin && !plan.joined) continue;
    days.push({
      date,
      part: plan.part,
      deadline: plan.deadline,
      joined: plan.joined,
      canJoin,
      event: plan.event,
      canCancel: now <= noticeDeadlineOf(date, plan.deadline, settings.noticeLeadMinutes),
    });
  }
  return days;
}

export type JoinDecision =
  { ok: true; change: 'add' | 'remove' | 'none' } | { ok: false; message: string };

const refuse = (message: string): JoinDecision => ({ ok: false, message });

export function decideJoin(
  input: JoinContext & {
    member: Pick<Member, 'status' | 'retiredOn'>;
    date: string;
    action: 'join' | 'cancel';
  },
): JoinDecision {
  const { member, date, action } = input;
  if (!isPracticeDate(date)) return refuse('日付が正しくありません。');
  if (!isEnrolled(member.status) || !isRetiredOn(member, date)) {
    return refuse('参加の登録は引退した人だけが使います。');
  }
  const day = upcomingJoinDays(input).find((candidate) => candidate.date === date);
  if (!day) return refuse('この日は練習日ではないか、登録できる期間を過ぎています。');

  if (action === 'join') {
    if (!day.canJoin) return refuse('集合時刻を過ぎたので登録できません。');
    return { ok: true, change: day.joined ? 'none' : 'add' };
  }
  if (!day.joined) return { ok: true, change: 'none' };
  if (!day.canCancel) {
    return refuse('取り消しの締め切りを過ぎました。来られない場合は欠席の連絡を送ってください。');
  }
  return { ok: true, change: 'remove' };
}
