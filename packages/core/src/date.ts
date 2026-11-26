const PRACTICE_TIME_ZONE = 'Asia/Tokyo';
/** 日本には夏時間がないので、時差は固定でよい。 */
const JST_OFFSET = '+09:00';
const MS_PER_DAY = 86_400_000;

/** 日本時間の日付（`YYYY-MM-DD`）。 */
export type PracticeDate = string;
/** 日本時間の時刻（`HH:mm`）。 */
export type ClockTime = string;

const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: PRACTICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(instant: Date) {
  const parts = dateTimeFormat.formatToParts(instant);
  return (type: 'year' | 'month' | 'day' | 'hour' | 'minute') =>
    parts.find((part) => part.type === type)?.value ?? '';
}

/** ある瞬間が属する練習日（日本時間の日付）を `YYYY-MM-DD` で返す。 */
export function toPracticeDate(instant: Date): PracticeDate {
  const valueOf = partsOf(instant);
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}

/** ある瞬間の日本時間の時刻を `HH:mm` で返す。 */
export function toClockTime(instant: Date): ClockTime {
  const valueOf = partsOf(instant);
  return `${valueOf('hour')}:${valueOf('minute')}`;
}

/** 日本時間の日付と時刻が指す瞬間。 */
export function toInstant(date: PracticeDate, time: ClockTime): Date {
  const instant = new Date(`${date}T${time}:00${JST_OFFSET}`);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`日時の形式が正しくありません: ${date} ${time}`);
  }
  return instant;
}

function toUtcMidnight(date: PracticeDate): number {
  if (!isPracticeDate(date)) {
    throw new RangeError(`日付の形式が正しくありません: ${date}`);
  }
  return Date.parse(`${date}T00:00:00Z`);
}

export function isPracticeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addDays(date: PracticeDate, days: number): PracticeDate {
  return new Date(toUtcMidnight(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: PracticeDate, to: PracticeDate): number {
  return (toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY;
}

/** 0=日曜 … 6=土曜。 */
export function weekdayOf(date: PracticeDate): number {
  return new Date(toUtcMidnight(date)).getUTCDay();
}

/** 4月に始まる年度。 */
export function fiscalYearOf(date: PracticeDate): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? year : year - 1;
}
