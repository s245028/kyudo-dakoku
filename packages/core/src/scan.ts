import { toInstant, toPracticeDate, type ClockTime, type PracticeDate } from './date.ts';
import { lateMinutesOf } from './attendance.ts';
import { isEnrolled, isRetiredOn, STATUS_LABELS, type Member } from './member.ts';
import { PART_LABELS, type PracticePlan } from './practice.ts';
import { validPunches, type Punch, type PunchKind } from './punch.ts';
import type { Settings } from './settings.ts';

const wholeSeconds = (instant: Date) => Math.floor(instant.getTime() / 1000);

/** 打刻できない理由。打刻できるなら null。 */
export function punchRefusal(member: Pick<Member, 'status' | 'approved'>): string | null {
  if (!isEnrolled(member.status)) {
    return `${STATUS_LABELS[member.status]}のため打刻できません。主将に確認してください。`;
  }
  if (!member.approved) return '主将の承認待ちです。承認されると打刻できるようになります。';
  return null;
}

/** 読み取った内容が入口の QR か。設定が空なら何も受け付けない。 */
export function isEntranceQr(scanned: string, settings: Pick<Settings, 'entranceQr'>): boolean {
  const expected = settings.entranceQr.trim();
  return expected !== '' && scanned.trim() === expected;
}

export type ScanDecision<T extends Punch> =
  | { action: 'ignore'; last: T }
  | { action: 'record'; kind: Extract<PunchKind, 'in' | 'out'>; firstInToday: boolean };

/**
 * 読み取りを入室・退室のどちらにするか決める。直前の打刻に近い読み取りは無視する。
 * `punches` はその人の打刻。今日の分だけを使う。
 */
export function decideScan<T extends Punch>(input: {
  punches: readonly T[];
  now: Date;
  duplicateScanSeconds: number;
}): ScanDecision<T> {
  const today = toPracticeDate(input.now);
  const todays = validPunches(input.punches).filter((punch) => toPracticeDate(punch.at) === today);
  const last = todays.at(-1);
  if (last && wholeSeconds(input.now) - wholeSeconds(last.at) < input.duplicateScanSeconds) {
    return { action: 'ignore', last };
  }
  const kind = last?.kind === 'in' ? 'out' : 'in';
  const firstInToday = kind === 'in' && !todays.some((punch) => punch.kind === 'in');
  return { action: 'record', kind, firstInToday };
}

/** その日の最初の入室の結果を、画面に出す文にする。出すものがなければ null。 */
export function describeFirstEntry(input: {
  member: Pick<Member, 'status' | 'retiredOn'>;
  date: PracticeDate;
  plan: PracticePlan | null;
  enteredAt: Date;
}): { message: string; lateMinutes: number } | null {
  const { member, date, plan, enteredAt } = input;
  if (!plan || plan.exempt) return null;
  if (isRetiredOn(member, date) && !plan.joined) {
    return { message: '引退後の参加（参加登録なし・判定なし）', lateMinutes: 0 };
  }
  const late = lateMinutesOf(date, plan.deadline, enteredAt);
  const basis = `${PART_LABELS[plan.part]}・${plan.deadline}基準`;
  const message = late > 0 ? `遅刻 ${late}分（${basis}）` : `時間内（${basis}）`;
  return { message, lateMinutes: late };
}

/** 打刻を取り消せない理由。取り消せるなら null。 */
export function undoRefusal(input: {
  punch: Punch | null;
  memberId: string;
  now: Date;
  undoSeconds: number;
}): string | null {
  const { punch, memberId, now, undoSeconds } = input;
  if (!punch) return '記録が見つかりません';
  if (punch.memberId !== memberId) return '自分の記録ではありません';
  if (punch.canceledAt) return 'すでに取り消されています';
  const expired = now.getTime() - punch.at.getTime() > undoSeconds * 1000;
  if (expired || punch.kind === 'auto_out') {
    return '取り消せる時間を過ぎました。主将に修正を依頼してください。';
  }
  return null;
}

/** いま道場にいる人と入室した時刻を、入室の早い順に返す。`punches` は当日の分。 */
export function presentMembers(punches: readonly Punch[]): { memberId: string; since: Date }[] {
  const latest = new Map<string, Punch>();
  for (const punch of validPunches(punches)) latest.set(punch.memberId, punch);
  return [...latest.values()]
    .filter((punch) => punch.kind === 'in')
    .map((punch) => ({ memberId: punch.memberId, since: punch.at }))
    .sort((a, b) => a.since.getTime() - b.since.getTime());
}

/**
 * 在室中の人につける自動退室。時刻は自動退室の時刻にする。
 * それより後に入室した人は、入室と同じ時刻にする。
 */
export function planAutoCheckout(input: {
  date: PracticeDate;
  punches: readonly Punch[];
  autoCheckoutTime: ClockTime;
}): { memberId: string; at: Date }[] {
  const checkoutAt = toInstant(input.date, input.autoCheckoutTime);
  const todays = input.punches.filter((punch) => toPracticeDate(punch.at) === input.date);
  return presentMembers(todays).map(({ memberId, since }) => ({
    memberId,
    at: since > checkoutAt ? since : checkoutAt,
  }));
}
