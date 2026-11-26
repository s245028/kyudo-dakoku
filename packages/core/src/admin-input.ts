// 管理画面の入力を確かめる
import { MANUAL_JUDGEMENTS, type ManualJudgement } from './attendance.ts';
import { isClockTime, isPracticeDate, type PracticeDate } from './date.ts';
import {
  GRADES,
  MEMBER_STATUSES,
  ROLES,
  type Grade,
  type MemberStatus,
  type Role,
} from './member.ts';
import type { PenaltyType } from './penalty.ts';
import {
  EXCEPTION_KINDS,
  PARTS,
  RULE_CONDITIONS,
  type ExceptionKind,
  type PracticeRule,
} from './practice.ts';
import { LATEST_AUTO_CHECKOUT_TIME } from './nightly.ts';
import { NAME_MAX_LENGTH } from './registration.ts';
import type { Settings } from './settings.ts';
import { invalid, type Validated } from './validation.ts';

export const MEMO_MAX_LENGTH = 200;
export const REASON_MAX_LENGTH = 30;
export const BASE_COUNT_MAX = 20;

/** 全員を対象にできる臨時変更。連絡と参加は個人にだけつく */
export const EVERYONE_EXCEPTION_KINDS: readonly ExceptionKind[] = [
  'day_off',
  'no_koma',
  'koma4',
  'koma5',
];

/** 主将への連絡日時を記録する臨時変更 */
export const NOTICE_EXCEPTION_KINDS: readonly ExceptionKind[] = ['absent_notice', 'late_notice'];

type Raw = Readonly<Record<string, unknown>>;

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return values.find((candidate) => candidate === value);
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isIntegerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export type MemberUpdate = Partial<{
  name: string;
  grade: Grade;
  status: MemberStatus;
  role: Role;
  retiredOn: PracticeDate | null;
}>;

/**
 * 名簿の変更。指定した項目だけを返す。
 * 引退にするときに引退日がなければ今日にし、現役に戻すときは引退日を消す。
 */
export function validateMemberUpdate(
  input: Raw,
  current: { status: MemberStatus; retiredOn: PracticeDate | null },
  today: PracticeDate,
): Validated<MemberUpdate> {
  const update: MemberUpdate = {};

  if (input['name'] !== undefined) {
    const name = text(input['name']).replace(/\s+/g, ' ');
    if (!name || name.length > NAME_MAX_LENGTH) return invalid('名前を入力してください。');
    update.name = name;
  }
  if (input['grade'] !== undefined) {
    const grade = oneOf(GRADES, input['grade']);
    if (!grade) return invalid('学年を選んでください。');
    update.grade = grade;
  }
  if (input['role'] !== undefined) {
    const role = oneOf(ROLES, input['role']);
    if (!role) return invalid('役職を選んでください。');
    update.role = role;
  }
  if (input['status'] !== undefined) {
    const status = oneOf(MEMBER_STATUSES, input['status']);
    if (!status) return invalid('状態を選んでください。');
    update.status = status;
  }
  if (
    input['retiredOn'] !== undefined &&
    input['retiredOn'] !== null &&
    input['retiredOn'] !== ''
  ) {
    const retiredOn = text(input['retiredOn']);
    if (!isPracticeDate(retiredOn)) return invalid('引退日が正しくありません。');
    update.retiredOn = retiredOn;
  }

  const status = update.status ?? current.status;
  if (status === 'active') update.retiredOn = null;
  if (status === 'retired' && !update.retiredOn) {
    update.retiredOn = current.retiredOn ?? today;
  }
  return { ok: true, value: update };
}

export type NewException = {
  date: PracticeDate;
  memberId: string | null;
  kind: ExceptionKind;
  memo: string;
  contactedAt: Date | null;
};

export function validateException(input: Raw): Validated<NewException> {
  const date = text(input['date']);
  const kind = oneOf(EXCEPTION_KINDS, input['kind']);
  const memberId = text(input['memberId']) || null;
  const memo = text(input['memo']).slice(0, MEMO_MAX_LENGTH);
  const contacted = text(input['contactedAt']);

  if (!isPracticeDate(date)) return invalid('日付が正しくありません。');
  if (!kind) return invalid('内容を選んでください。');
  if (!memberId && !EVERYONE_EXCEPTION_KINDS.includes(kind)) {
    return invalid('この内容は、部員を選んでください。');
  }
  let contactedAt: Date | null = null;
  if (contacted && NOTICE_EXCEPTION_KINDS.includes(kind)) {
    contactedAt = new Date(contacted);
    if (Number.isNaN(contactedAt.getTime())) return invalid('連絡日時が正しくありません。');
  }
  return { ok: true, value: { date, memberId, kind, memo, contactedAt } };
}

export type ManualInput = { judgement: ManualJudgement | null; reason: string };

/** 手動判定。上書きするときは修正理由が必要。空にすると自動判定に戻る。 */
export function validateManualJudgement(input: Raw): Validated<ManualInput> {
  const raw = input['judgement'];
  if (raw === null || raw === '') return { ok: true, value: { judgement: null, reason: '' } };
  const judgement = oneOf(MANUAL_JUDGEMENTS, raw);
  if (!judgement) return invalid('判定を選んでください。');
  const reason = text(input['reason']).slice(0, MEMO_MAX_LENGTH);
  if (!reason) return invalid('修正理由を入力してください。');
  return { ok: true, value: { judgement, reason } };
}

/** 画面から変えられる設定。入口QRは印刷して貼ってあるので変えられない */
export type EditableSettings = Omit<Settings, 'entranceQr'>;

const NUMBER_SETTINGS = {
  allowedDistanceMeters: { min: 1, max: 10_000, label: '許容距離' },
  duplicateScanSeconds: { min: 0, max: 3600, label: '二重読み取りを無視する秒数' },
  undoSeconds: { min: 0, max: 600, label: '取り消しできる秒数' },
  noticeLeadMinutes: { min: 0, max: 1440, label: '連絡の締め切り' },
  penaltyDoublingDays: { min: 1, max: 365, label: '罰が倍になる日数' },
} as const;

export function validateSettings(input: Raw): Validated<EditableSettings> {
  const numbers = {} as Record<keyof typeof NUMBER_SETTINGS, number>;
  for (const [key, { min, max, label }] of Object.entries(NUMBER_SETTINGS)) {
    const value = input[key];
    if (!isIntegerIn(value, min, max)) {
      return invalid(`${label}は${min}〜${max}の整数にしてください。`);
    }
    numbers[key as keyof typeof NUMBER_SETTINGS] = value;
  }
  const latitude = input['dojoLatitude'] ?? null;
  const longitude = input['dojoLongitude'] ?? null;
  const validCoordinate = (value: unknown, limit: number): value is number =>
    typeof value === 'number' && Math.abs(value) <= limit;
  const noLocation = latitude === null && longitude === null;
  if (!noLocation && !(validCoordinate(latitude, 90) && validCoordinate(longitude, 180))) {
    return invalid('緯度と経度は、両方とも正しい数値にするか、両方とも空にしてください。');
  }
  const autoCheckoutTime = text(input['autoCheckoutTime']);
  if (!isClockTime(autoCheckoutTime)) return invalid('自動退室の時刻が正しくありません。');
  if (autoCheckoutTime > LATEST_AUTO_CHECKOUT_TIME) {
    return invalid(`自動退室の時刻は${LATEST_AUTO_CHECKOUT_TIME}までにしてください。`);
  }

  return {
    ok: true,
    value: {
      ...numbers,
      dojoLatitude: noLocation ? null : latitude,
      dojoLongitude: noLocation ? null : longitude,
      autoCheckoutTime,
      komaLocked: input['komaLocked'] === true,
    },
  };
}

export function validatePracticeRule(input: Raw): Validated<PracticeRule> {
  const weekday = input['weekday'];
  const condition = oneOf(RULE_CONDITIONS, input['condition']);
  const part = oneOf(PARTS, input['part']);
  const deadline = text(input['deadline']);
  const startTime = text(input['startTime']);

  if (!isIntegerIn(weekday, 0, 6)) return invalid('曜日を選んでください。');
  if (!condition) return invalid('条件を選んでください。');
  if (!part) return invalid('区分を選んでください。');
  if (!isClockTime(deadline) || !isClockTime(startTime)) {
    return invalid('集合時刻と練習開始の時刻を入力してください。');
  }
  return { ok: true, value: { weekday, condition, part, deadline, startTime } };
}

export function validatePenaltyType(
  input: Raw,
): Validated<Pick<PenaltyType, 'reason' | 'baseCount' | 'description'>> {
  const reason = text(input['reason']);
  const baseCount = input['baseCount'];
  if (!reason || reason.length > REASON_MAX_LENGTH) return invalid('理由を入力してください。');
  if (!isIntegerIn(baseCount, 1, BASE_COUNT_MAX)) {
    return invalid(`基本の数は1〜${BASE_COUNT_MAX}の整数にしてください。`);
  }
  const description = text(input['description']).slice(0, MEMO_MAX_LENGTH);
  return { ok: true, value: { reason, baseCount, description } };
}
