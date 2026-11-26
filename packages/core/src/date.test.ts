import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  fiscalYearOf,
  isClockTime,
  isPracticeDate,
  toClockTime,
  toInstant,
  toPracticeDate,
  weekdayOf,
} from './date.ts';

describe('toPracticeDate', () => {
  it.each([
    ['2026-11-26T14:59:59.999Z', '2026-11-26'],
    ['2026-11-26T15:00:00.000Z', '2026-11-27'],
    ['2026-12-31T15:00:00.000Z', '2027-01-01'],
  ])('%s は日本時間の %s', (instant, expected) => {
    expect(toPracticeDate(new Date(instant))).toBe(expected);
  });

  it('不正な日時は例外にする', () => {
    expect(() => toPracticeDate(new Date('invalid'))).toThrow(RangeError);
  });
});

describe('日本時間の日付と時刻', () => {
  it('日付と時刻から瞬間を作り、元に戻せる', () => {
    const instant = toInstant('2026-11-30', '00:05');

    expect(instant.toISOString()).toBe('2026-11-29T15:05:00.000Z');
    expect(toClockTime(instant)).toBe('00:05');
  });

  it('存在しない日付や時刻の形式を拒否する', () => {
    expect(isPracticeDate('2027-02-29')).toBe(false);
    expect(isPracticeDate('2028-02-29')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('08:20')).toBe(true);
    expect(() => addDays('2027-02-29', 1)).toThrow(RangeError);
    expect(() => toInstant('2026-11-30', '25:00')).toThrow(RangeError);
  });

  it('月と年をまたいで数える', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7);
    expect(weekdayOf('2026-11-30')).toBe(1);
  });

  it('年度は4月に始まる', () => {
    expect(fiscalYearOf('2027-03-31')).toBe(2026);
    expect(fiscalYearOf('2027-04-01')).toBe(2027);
  });
});
