import { toInstant, toPracticeDate, type ClockTime } from './date.ts';

/** 自動退室の時刻から、夜の処理を始めるまでの時間 */
export const NIGHTLY_DELAY_MINUTES = 15;
/** 夜の処理が同じ日のうちに動くようにするための、自動退室の時刻の上限 */
export const LATEST_AUTO_CHECKOUT_TIME: ClockTime = '23:30';

/** 今日の夜の処理（自動退室と判定）を実行する時刻を過ぎたか。 */
export function isNightlyDue(now: Date, autoCheckoutTime: ClockTime): boolean {
  const checkout = toInstant(toPracticeDate(now), autoCheckoutTime);
  return now.getTime() >= checkout.getTime() + NIGHTLY_DELAY_MINUTES * 60_000;
}
