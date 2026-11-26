import { weekdayOf, type PracticeDate } from '@kyudo/core';

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/** `12/1` */
export function shortDate(date: PracticeDate): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** `12/1（火）` */
export function dateWithWeekday(date: PracticeDate): string {
  return `${shortDate(date)}（${WEEKDAY_LABELS[weekdayOf(date)]}）`;
}
