import { describe, expect, it } from 'vitest';
import {
  presetPeriod,
  previousPeriod,
  rangeLabel,
  rankDescending,
  runningTotal,
  splitPeriod,
  validatePeriod,
} from './stats.ts';

describe('presetPeriod', () => {
  it('今月は1日から今日まで', () => {
    expect(presetPeriod('this_month', '2026-11-28')).toEqual({
      from: '2026-11-01',
      to: '2026-11-28',
    });
  });

  it('先月は、年をまたいでも1か月ぶん', () => {
    expect(presetPeriod('last_month', '2027-01-05')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('今年度は4月1日から', () => {
    expect(presetPeriod('fiscal_year', '2027-03-31').from).toBe('2026-04-01');
    expect(presetPeriod('fiscal_year', '2027-04-01').from).toBe('2027-04-01');
  });
});

describe('validatePeriod', () => {
  it('同じ日も指定できる', () => {
    expect(validatePeriod('2026-11-01', '2026-11-01').ok).toBe(true);
  });

  it('空欄、逆の順、長すぎる期間は断る', () => {
    expect(validatePeriod('', '2026-11-01').ok).toBe(false);
    expect(validatePeriod('2026-11-02', '2026-11-01').ok).toBe(false);
    // 日付の入力の途中では、年が小さな値になる
    expect(validatePeriod('0002-11-01', '2026-11-01').ok).toBe(false);
  });
});

describe('splitPeriod', () => {
  it('2週間までは日ごと', () => {
    const { unit, buckets } = splitPeriod({ from: '2026-11-01', to: '2026-11-14' });
    expect(unit).toBe('day');
    expect(buckets).toHaveLength(14);
    expect(buckets[0]).toMatchObject({ label: '11/1', description: '11/1（日）' });
  });

  it('週は月曜から始め、両端は期間の内側にする', () => {
    const { unit, buckets } = splitPeriod({ from: '2026-11-01', to: '2026-11-28' });
    expect(unit).toBe('week');
    expect(buckets.map(({ from, to }) => [from, to])).toEqual([
      ['2026-11-01', '2026-11-01'],
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-28'],
    ]);
    expect(buckets[1]!.description).toBe('11/2〜11/8');
  });

  it('長い期間は月ごと', () => {
    const { unit, buckets } = splitPeriod({ from: '2026-04-01', to: '2026-11-28' });
    expect(unit).toBe('month');
    expect(buckets.map((bucket) => bucket.label)).toEqual(
      [4, 5, 6, 7, 8, 9, 10, 11].map((month) => `${month}月`),
    );
    expect(buckets.at(-1)).toMatchObject({ from: '2026-11-01', to: '2026-11-28' });
  });

  it('12か月を超えたら年を付ける', () => {
    const { buckets } = splitPeriod({ from: '2026-01-15', to: '2027-02-01' });
    expect(buckets[0]!.label).toBe('26/1');
    expect(buckets.at(-1)!.label).toBe('27/2');
  });
});

describe('順位と累計', () => {
  it('同じ値は同じ順位で、次は飛ぶ', () => {
    const ranked = rankDescending(
      [
        { id: 'a', value: 1 },
        { id: 'b', value: 3 },
        { id: 'c', value: 2 },
        { id: 'd', value: 2 },
      ],
      (item) => item.value,
    );
    expect(ranked.map(({ id, rank }) => [id, rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['d', 2],
      ['a', 4],
    ]);
  });

  it('先頭から足していく', () => {
    expect(runningTotal([2, 0, 3])).toEqual([2, 2, 5]);
  });
});

describe('previousPeriod', () => {
  const previous = (preset: Parameters<typeof previousPeriod>[0], from: string, to: string) =>
    previousPeriod(preset, { from, to });

  it('今月は前月の同じ日まで。短い月は末日まで', () => {
    expect(previous('this_month', '2026-11-01', '2026-11-28')).toEqual({
      from: '2026-10-01',
      to: '2026-10-28',
    });
    expect(previous('this_month', '2027-03-01', '2027-03-31').to).toBe('2027-02-28');
    expect(previous('this_month', '2027-01-01', '2027-01-05').from).toBe('2026-12-01');
  });

  it('先月は先々月のすべて', () => {
    expect(previous('last_month', '2026-10-01', '2026-10-31')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('今年度は前年度の同じ日まで', () => {
    expect(previous('fiscal_year', '2026-04-01', '2026-11-28')).toEqual({
      from: '2025-04-01',
      to: '2025-11-28',
    });
    expect(previous('fiscal_year', '2027-04-01', '2028-02-29').to).toBe('2027-02-28');
  });

  it('日付の指定は、直前の同じ日数', () => {
    expect(previous('custom', '2026-11-10', '2026-11-16')).toEqual({
      from: '2026-11-03',
      to: '2026-11-09',
    });
  });
});

describe('rangeLabel', () => {
  it('同じ月は日だけを続け、必要なら年を付ける', () => {
    const label = (from: string, to: string, withYear?: boolean) =>
      rangeLabel({ from, to }, withYear);
    expect(label('2026-11-01', '2026-11-28')).toBe('11/1〜28');
    expect(label('2026-11-01', '2026-11-01')).toBe('11/1');
    expect(label('2025-04-01', '2025-11-28', true)).toBe('25/4/1〜11/28');
    expect(label('2026-04-01', '2027-01-05', true)).toBe('26/4/1〜27/1/5');
  });
});
