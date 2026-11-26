import { describe, expect, it } from 'vitest';
import { toInstant } from './date.ts';
import { isNightlyDue } from './nightly.ts';
import { MONDAY } from './testing.ts';

describe('夜の処理の時刻', () => {
  it.each([
    ['22:00', false],
    ['22:14', false],
    ['22:15', true],
    ['23:59', true],
    ['00:00', false],
  ])('自動退室が22:00なら、%s は %s', (time, due) => {
    expect(isNightlyDue(toInstant(MONDAY, time), '22:00')).toBe(due);
  });

  it('自動退室の時刻を変えると、実行の時刻も変わる', () => {
    expect(isNightlyDue(toInstant(MONDAY, '22:15'), '23:00')).toBe(false);
    expect(isNightlyDue(toInstant(MONDAY, '23:15'), '23:00')).toBe(true);
  });
});
