// 行事の日（例会、射会など）。その日は全員が行事の時刻で練習する
import { isClockTime, isPracticeDate, type ClockTime, type PracticeDate } from './date.ts';
import { invalid, type Validated } from './validation.ts';

export const EVENT_TITLE_MAX_LENGTH = 30;
export const EVENT_MEMO_MAX_LENGTH = 200;
export const EVENT_MAX_SHOTS = 200;

export type PracticeEvent = {
  title: string;
  /** 集合時刻。これを過ぎた入室は遅刻 */
  deadline: ClockTime;
  startTime: ClockTime;
  /** 決めていなければ null */
  endTime: ClockTime | null;
  /** 1人が引く射数。決めていなければ null */
  shots: number | null;
  /** 練習の内容。なければ空 */
  memo: string;
};

export type EventInput = { date: PracticeDate; event: PracticeEvent };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** 行事の入力を確かめる。 */
export function validateEvent(
  input: Readonly<Record<string, unknown>>,
  options: {
    today: PracticeDate;
    /** 過ぎた日を変えられる人（主将と管理者）か */
    allowPast: boolean;
  },
): Validated<EventInput> {
  const date = text(input['date']);
  const title = text(input['title']).replace(/\s+/g, ' ');
  const deadline = text(input['deadline']);
  const startTime = text(input['startTime']);
  const endTime = text(input['endTime']) || null;
  const rawShots = text(input['shots']);
  const shots = rawShots === '' ? null : Number(rawShots);

  if (!isPracticeDate(date)) return invalid('日付を入れてください。');
  if (!options.allowPast && date < options.today) {
    return invalid('今日より前の予定は、主将か管理者が変えます。');
  }
  if (!title || title.length > EVENT_TITLE_MAX_LENGTH) {
    return invalid(`行事の名前を${EVENT_TITLE_MAX_LENGTH}文字までで入れてください。`);
  }
  if (!isClockTime(deadline) || !isClockTime(startTime)) {
    return invalid('集合時刻と練習開始の時刻を入力してください。');
  }
  if (endTime !== null && !(isClockTime(endTime) && endTime > startTime)) {
    return invalid('練習の終了は、開始より後の時刻にしてください。');
  }
  if (shots !== null && !(Number.isInteger(shots) && shots >= 1 && shots <= EVENT_MAX_SHOTS)) {
    return invalid(`射数は1〜${EVENT_MAX_SHOTS}の整数にしてください。`);
  }
  return {
    ok: true,
    value: {
      date,
      event: {
        title,
        deadline,
        startTime,
        endTime,
        shots,
        memo: text(input['memo']).slice(0, EVENT_MEMO_MAX_LENGTH),
      },
    },
  };
}

/** 画面に出す行事の時刻と射数。`09:00集合・09:30開始・12:00終了・20射` */
export function describeEvent({ deadline, startTime, endTime, shots }: PracticeEvent): string {
  return [
    `${deadline}集合`,
    `${startTime}開始`,
    ...(endTime ? [`${endTime}終了`] : []),
    ...(shots ? [`${shots}射`] : []),
  ].join('・');
}
