// 統計に共通する、期間・区切り・順位の計算。項目ごとの集計は `<項目>-stats.ts` に置く
import {
  addDays,
  dateWithWeekday,
  daysBetween,
  fiscalYearOf,
  isPracticeDate,
  shortDate,
  weekdayOf,
  type PracticeDate,
} from './date.ts';
import { invalid, type Validated } from './validation.ts';

/** 集計する期間。両端の日を含む */
export type StatsPeriod = { from: PracticeDate; to: PracticeDate };

export const PERIOD_PRESETS = ['this_month', 'last_month', 'fiscal_year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  this_month: '今月',
  last_month: '先月',
  fiscal_year: '今年度',
};

/** この日数までは日ごとに区切る */
const DAILY_MAX_DAYS = 14;
/** この日数までは週ごとに区切り、超えたら月ごとにする */
const WEEKLY_MAX_DAYS = 100;
const MAX_PERIOD_DAYS = 3660;
const MONTHS_PER_YEAR = 12;
const MONDAY = 1;

const monthStart = (date: PracticeDate): PracticeDate => `${date.slice(0, 7)}-01`;

/** 今月と今年度は、今日までを数える */
export function presetPeriod(preset: PeriodPreset, today: PracticeDate): StatsPeriod {
  if (preset === 'this_month') return { from: monthStart(today), to: today };
  if (preset === 'fiscal_year') return { from: `${fiscalYearOf(today)}-04-01`, to: today };
  const end = addDays(monthStart(today), -1);
  return { from: monthStart(end), to: end };
}

/** 日付を指定した期間を確かめる。 */
export function validatePeriod(from: string, to: string): Validated<StatsPeriod> {
  if (!isPracticeDate(from) || !isPracticeDate(to)) {
    return invalid('開始日と終了日を入れてください。');
  }
  if (from > to) return invalid('開始日は、終了日と同じか前の日にしてください。');
  if (daysBetween(from, to) >= MAX_PERIOD_DAYS) return invalid('期間は10年以内にしてください。');
  return { ok: true, value: { from, to } };
}

/** 月と日はそのままで、年や月を戻す。その日がなければ、月の末日にする */
function monthsBefore(date: PracticeDate, months: number): PracticeDate {
  const index = Number(date.slice(0, 4)) * MONTHS_PER_YEAR + Number(date.slice(5, 7)) - 1 - months;
  const month = String((index % MONTHS_PER_YEAR) + 1).padStart(2, '0');
  const start = `${Math.floor(index / MONTHS_PER_YEAR)}-${month}-01`;
  const end = addDays(nextStart(start, 'month'), -1);
  const day = `${start.slice(0, 8)}${date.slice(8)}`;
  return day < end ? day : end;
}

/**
 * 比べる相手の期間。今月は前月の同じ日まで、先月は先々月、今年度は前年度の同じ日まで、
 * 日付の指定は、直前の同じ日数。
 */
export function previousPeriod(preset: PeriodPreset | 'custom', period: StatsPeriod): StatsPeriod {
  const { from, to } = period;
  if (preset === 'last_month') {
    const end = addDays(from, -1);
    return { from: monthStart(end), to: end };
  }
  if (preset === 'custom') {
    const days = daysBetween(from, to) + 1;
    return { from: addDays(from, -days), to: addDays(from, -1) };
  }
  const months = preset === 'this_month' ? 1 : MONTHS_PER_YEAR;
  return { from: monthsBefore(from, months), to: monthsBefore(to, months) };
}

/** 表の見出しに使う短い期間。`11/1〜28`、`4/1〜11/28`。`withYear` なら年を2桁で付ける。 */
export function rangeLabel({ from, to }: StatsPeriod, withYear = false): string {
  const year = (date: PracticeDate) => `${date.slice(2, 4)}/`;
  const start = `${withYear ? year(from) : ''}${shortDate(from)}`;
  if (from === to) return start;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${start}〜${Number(to.slice(8))}`;
  const needsYear = withYear && from.slice(0, 4) !== to.slice(0, 4);
  return `${start}〜${needsYear ? year(to) : ''}${shortDate(to)}`;
}

export const isWithin = (date: PracticeDate, { from, to }: StatsPeriod) =>
  date >= from && date <= to;

export type BucketUnit = 'day' | 'week' | 'month';

export const BUCKET_UNIT_LABELS: Record<BucketUnit, string> = {
  day: '日ごと',
  week: '週ごと',
  month: '月ごと',
};

/** 推移を見るための区切り。`label` は軸の短い表示、`description` は読むときの表示 */
export type Bucket = StatsPeriod & { label: string; description: string };

/** 区切りの次の日。週は月曜、月は1日から始まる */
function nextStart(date: PracticeDate, unit: BucketUnit): PracticeDate {
  if (unit === 'day') return addDays(date, 1);
  if (unit === 'week') return addDays(date, 7 - ((weekdayOf(date) - MONDAY + 7) % 7));
  return monthStart(addDays(monthStart(date), 31));
}

function describeBucket(
  { from, to }: StatsPeriod,
  unit: BucketUnit,
  overYears: boolean,
): Pick<Bucket, 'label' | 'description'> {
  if (unit === 'day') return { label: shortDate(from), description: dateWithWeekday(from) };
  if (unit === 'week') {
    const description = from === to ? shortDate(from) : `${shortDate(from)}〜${shortDate(to)}`;
    return { label: shortDate(from), description };
  }
  const year = from.slice(0, 4);
  const month = Number(from.slice(5, 7));
  return {
    label: overYears ? `${year.slice(2)}/${month}` : `${month}月`,
    description: `${year}年${month}月`,
  };
}

/** 期間を、長さに合わせて日・週・月に区切る。端の区切りは期間の内側に切りそろえる。 */
export function splitPeriod(period: StatsPeriod): { unit: BucketUnit; buckets: Bucket[] } {
  const days = daysBetween(period.from, period.to) + 1;
  const unit = days <= DAILY_MAX_DAYS ? 'day' : days <= WEEKLY_MAX_DAYS ? 'week' : 'month';
  const ranges: StatsPeriod[] = [];
  for (let from = period.from; from <= period.to; from = nextStart(from, unit)) {
    const end = addDays(nextStart(from, unit), -1);
    ranges.push({ from, to: end < period.to ? end : period.to });
  }
  // 月が1年を超えて並ぶときは、同じ月と区別できるように年を付ける
  const overYears = ranges.length > MONTHS_PER_YEAR;
  return {
    unit,
    buckets: ranges.map((range) => ({ ...range, ...describeBucket(range, unit, overYears) })),
  };
}

/** 先頭からの合計 */
export function runningTotal(values: readonly number[]): number[] {
  let total = 0;
  return values.map((value) => (total += value));
}

/**
 * 値の大きい順に並べて順位を付ける。同じ値は同じ順位で、次の順位は人数ぶん飛ぶ（1, 2, 2, 4）。
 * 同じ値の中では、渡した順を保つ。
 */
export function rankDescending<T>(
  items: readonly T[],
  valueOf: (item: T) => number,
): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  return sorted.map((item) => ({
    ...item,
    rank: sorted.findIndex((other) => valueOf(other) === valueOf(item)) + 1,
  }));
}
