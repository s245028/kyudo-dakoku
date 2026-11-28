import { describe, expect, it } from 'vitest';
import { buildPoster, nameWidth } from './hit-poster.ts';
import type { HitDay, HitPeriod } from './hit-stats.ts';

const none = { shots: 0, hits: 0 };
const day = (memberId: string, shots: number, hits: number, date = '2026-11-10'): HitDay => ({
  memberId,
  date,
  tallies: { standing: none, drill: { shots, hits }, self: none },
});

const member = (id: string, gender: 'male' | 'female' = 'male') => ({ id, name: id, gender });

const november: HitPeriod = {
  id: 'this_month',
  label: '今月',
  period: { from: '2026-11-01', to: '2026-11-28' },
};

const members = [member('a'), member('b', 'female'), member('c'), member('d', 'female')];
const days = [
  day('a', 100, 60),
  day('b', 80, 60),
  day('c', 8, 8),
  day('d', 40, 20),
  day('a', 40, 40, '2026-10-31'),
];

const poster = (options: Partial<Parameters<typeof buildPoster>[0]> = {}) =>
  buildPoster({
    days,
    members,
    period: november,
    metric: 'rate',
    target: 'split',
    filter: 'all',
    ...options,
  });

describe('張り出しの順位', () => {
  it('男女別に、条件の射数に足りた人だけを載せる', () => {
    const result = poster();

    expect(result.title).toBe('2026年11月　的中率順');
    expect(result.subtitle).toBe('島根大学弓道部　11/1〜11/28　3区分の合計');
    expect(result.columns.map((column) => [column.heading, column.rows])).toEqual([
      ['男子', [{ rank: 1, name: 'a', shots: 100, hits: 60 }]],
      [
        '女子',
        [
          { rank: 1, name: 'b', shots: 80, hits: 60 },
          { rank: 2, name: 'd', shots: 40, hits: 20 },
        ],
      ],
    ]);
    expect(result.note).toContain('40射以上');
  });

  it('射数と的中数の順位は、引いた人全員を男女まとめて載せる', () => {
    const shots = poster({ metric: 'shots', target: 'all' });
    const hits = poster({ metric: 'hits', target: 'all' });

    expect(shots.columns[0]?.rows.map((row) => row.name)).toEqual(['a', 'b', 'd', 'c']);
    expect(hits.columns[0]?.rows.map((row) => [row.name, row.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['d', 3],
      ['c', 4],
    ]);
  });

  it('区分を絞ると12射以上', () => {
    const result = poster({ filter: 'drill', target: 'male' });

    expect(result.columns[0]?.rows.map((row) => row.name)).toEqual(['a']);
    expect(result.note).toContain('12射以上');
  });

  it('長い一覧は、順位を続けて2列に分ける', () => {
    const many = Array.from({ length: 31 }, (_, i) => member(`m${String(i).padStart(2, '0')}`));
    const result = poster({
      members: many,
      days: many.map((entry, i) => day(entry.id, 100, 90 - i)),
      target: 'all',
    });

    expect(result.columns.map((column) => column.rows.length)).toEqual([16, 15]);
    expect(result.columns[1]?.rows[0]?.rank).toBe(17);
  });

  it('いちばん長い名前の長さを添える', () => {
    expect(nameWidth('山田 太郎')).toBeCloseTo(4.55);
    expect(
      poster({ members: [member('長谷川原 小太郎')], days: [day('長谷川原 小太郎', 40, 1)] }),
    ).toMatchObject({ longestName: nameWidth('長谷川原 小太郎') });
  });

  it('年度の順位は年度を題にする', () => {
    const year: HitPeriod = {
      id: 'fiscal_year',
      label: '今年度',
      period: { from: '2026-04-01', to: '2027-01-05' },
    };

    expect(poster({ period: year, metric: 'shots' }).title).toBe('2026年度　射数順');
  });
});
