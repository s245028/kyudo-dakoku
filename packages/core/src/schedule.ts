// 部全体の予定（全員の休み・休講・補講）と、部員ごとの予定（公欠・コマの変更）
import { addDays, daysBetween, isPracticeDate, type PracticeDate } from './date.ts';
import { EXCEPTION_LABELS, type ExceptionKind } from './practice.ts';
import { invalid, type Validated } from './validation.ts';
import { MEMO_MAX_LENGTH } from './admin-input.ts';

/** 予定として扱う内容。連絡と参加は含まない */
export const SCHEDULE_KINDS = [
  'day_off',
  'no_koma',
  'koma4',
  'koma5',
] as const satisfies readonly ExceptionKind[];
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const KOMA_SCHEDULE_KINDS: readonly ScheduleKind[] = ['no_koma', 'koma4', 'koma5'];

/** 一度に指定できる期間の日数 */
export const SCHEDULE_MAX_DAYS = 92;

export const isScheduleKind = (kind: string): kind is ScheduleKind =>
  (SCHEDULE_KINDS as readonly string[]).includes(kind);

/** 画面の名前。一人だけの休みは「公欠」と呼ぶ。 */
export function scheduleLabel(kind: ScheduleKind, memberId: string | null): string {
  return kind === 'day_off' && memberId !== null ? '公欠' : EXCEPTION_LABELS[kind];
}

export type ScheduleInput = {
  /** null は部全体 */
  memberId: string | null;
  kind: ScheduleKind;
  memo: string;
  /** 指定した期間の日。古い順 */
  dates: PracticeDate[];
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** 予定の入力を確かめる。終了日が空なら1日だけ。 */
export function validateSchedule(
  input: Readonly<Record<string, unknown>>,
  options: {
    today: PracticeDate;
    /** 過ぎた日を変えられる人（主将と管理者）か */
    allowPast: boolean;
  },
): Validated<ScheduleInput> {
  const from = text(input['from']);
  const to = text(input['to']) || from;
  const kind = text(input['kind']);

  if (!isPracticeDate(from) || !isPracticeDate(to)) return invalid('日付を入れてください。');
  if (from > to) return invalid('開始日は、終了日と同じか前の日にしてください。');
  const days = daysBetween(from, to) + 1;
  if (days > SCHEDULE_MAX_DAYS) return invalid(`期間は${SCHEDULE_MAX_DAYS}日以内にしてください。`);
  if (!isScheduleKind(kind)) return invalid('内容を選んでください。');
  if (!options.allowPast && from < options.today) {
    return invalid('今日より前の予定は、主将か管理者が変えます。');
  }
  return {
    ok: true,
    value: {
      memberId: text(input['memberId']) || null,
      kind,
      memo: text(input['memo']).slice(0, MEMO_MAX_LENGTH),
      dates: Array.from({ length: days }, (_, index) => addDays(from, index)),
    },
  };
}

export type ScheduleEntry = {
  id: string;
  date: PracticeDate;
  memberId: string | null;
  kind: ScheduleKind;
  memo: string;
};

export type ScheduleRange = Omit<ScheduleEntry, 'id' | 'date'> & {
  from: PracticeDate;
  to: PracticeDate;
  ids: string[];
};

/** 同じ人・内容・メモで日が続くものを、1つの期間にまとめる。始まる日の順に返す。 */
export function groupSchedule(entries: readonly ScheduleEntry[]): ScheduleRange[] {
  const ranges: ScheduleRange[] = [];
  /** 人・内容・メモごとの、続きを足せる期間 */
  const open = new Map<string, ScheduleRange>();
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const { id, date, ...rest } = entry;
    const key = JSON.stringify([rest.memberId, rest.kind, rest.memo]);
    const range = open.get(key);
    if (range && daysBetween(range.to, date) <= 1) {
      range.to = date;
      range.ids.push(id);
    } else {
      const next = { ...rest, from: date, to: date, ids: [id] };
      open.set(key, next);
      ranges.push(next);
    }
  }
  return ranges;
}
