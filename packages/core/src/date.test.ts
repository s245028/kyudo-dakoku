import { describe, expect, it } from 'vitest';
import { toPracticeDate } from './date.ts';

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
