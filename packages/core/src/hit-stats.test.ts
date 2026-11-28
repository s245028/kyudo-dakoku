import { describe, expect, it } from 'vitest';
import {
  clubHitSeries,
  hitOverview,
  hitRankingPeriods,
  hitSeries,
  rankHits,
  totalOf,
  totalsByMember,
  type HitDay,
} from './hit-stats.ts';

type Tally = [shots: number, hits: number];

function day(
  memberId: string,
  date: string,
  tallies: { standing?: Tally; drill?: Tally; self?: Tally },
): HitDay {
  const of = ([shots, hits]: Tally = [0, 0]) => ({ shots, hits });
  return {
    memberId,
    date,
    tallies: {
      standing: of(tallies.standing),
      drill: of(tallies.drill),
      self: of(tallies.self),
    },
  };
}

const days = [
  day('a', '2026-11-02', { standing: [4, 4], drill: [36, 12] }),
  day('a', '2026-11-05', { self: [4, 0] }),
  day('b', '2026-11-02', { drill: [20, 10] }),
];

describe('合計', () => {
  it('的中数の合計と射数の合計で数え、日ごとの率は平均しない', () => {
    expect(totalOf(days.slice(0, 2), 'all')).toEqual({ shots: 44, hits: 16 });
  });

  it('練習は射込みと自練の合計で、引いていない人は含めない', () => {
    expect(totalsByMember(days, 'practice')).toEqual([
      { memberId: 'a', days: 2, shots: 40, hits: 12 },
      { memberId: 'b', days: 1, shots: 20, hits: 10 },
    ]);
    expect(totalsByMember(days, 'standing').map((total) => total.memberId)).toEqual(['a']);
  });
});

describe('順位', () => {
  const total = (memberId: string, shots: number, hits: number) => ({
    memberId,
    days: 1,
    shots,
    hits,
  });

  it('同じ的中率は同じ順位で、その中は射数の多い順', () => {
    const { ranked } = rankHits(
      [total('d', 80, 20), total('b', 40, 20), total('a', 100, 80), total('c', 60, 30)],
      'all',
    );

    expect(ranked.map(({ memberId, rank }) => [memberId, rank])).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 2],
      ['d', 4],
    ]);
  });

  it('すべては40射以上、区分で絞ると12射以上に順位が付き、足りない人は射数順に分ける', () => {
    const totals = [total('a', 40, 20), total('b', 39, 39), total('c', 12, 12), total('d', 11, 1)];

    expect(rankHits(totals, 'all').ranked.map((entry) => entry.memberId)).toEqual(['a']);
    expect(rankHits(totals, 'all').unranked.map((entry) => entry.memberId)).toEqual([
      'b',
      'c',
      'd',
    ]);
    expect(rankHits(totals, 'standing').ranked.map((entry) => entry.memberId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('射数と的中数の順位は、引いた人全員に付ける', () => {
    const totals = [total('a', 4, 4), total('b', 100, 20)];

    expect(rankHits(totals, 'all', 'shots').ranked.map((entry) => entry.memberId)).toEqual([
      'b',
      'a',
    ]);
    expect(rankHits(totals, 'all', 'hits').unranked).toEqual([]);
  });
});

describe('順位の期間', () => {
  it('今月・先月・今年度のあとに、始めた月までの過去の月を新しい順に並べる', () => {
    const periods = hitRankingPeriods('2026-08-20', '2026-11-28');

    expect(periods.map((entry) => entry.label)).toEqual([
      '今月',
      '先月',
      '今年度',
      '2026年9月',
      '2026年8月',
    ]);
    expect(periods.at(-2)?.period).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('始めたばかりのときは、3つだけ', () => {
    expect(hitRankingPeriods('2026-11-01', '2026-11-28')).toHaveLength(3);
  });

  it('月と年をまたぐ', () => {
    expect(hitRankingPeriods('2026-11-01', '2027-01-05').map((entry) => entry.id)).toEqual([
      'this_month',
      'last_month',
      'fiscal_year',
      '2026-11',
    ]);
  });
});

describe('推移', () => {
  it('短い期間は引いた日ごと', () => {
    const series = hitSeries(days, { from: '2026-11-01', to: '2026-11-28' }, 'all');

    expect(series.unit).toBe('day');
    expect(series.points.map(({ label, shots, hits }) => [label, shots, hits])).toEqual([
      ['11/2', 60, 26],
      ['11/5', 4, 0],
    ]);
  });

  it('長い期間は月ごとで、引いていない月は出さない', () => {
    const series = hitSeries(days, { from: '2026-04-01', to: '2026-11-28' }, 'all');

    expect(series.unit).toBe('month');
    expect(series.points.map((point) => [point.label, point.shots])).toEqual([['11月', 64]]);
  });

  it('期間の外の日は数えない（月の境目）', () => {
    const edges = [
      day('a', '2026-10-31', { drill: [4, 1] }),
      day('a', '2026-11-01', { drill: [8, 2] }),
      day('a', '2026-12-01', { drill: [12, 3] }),
    ];
    const november = { from: '2026-11-01', to: '2026-11-30' };

    expect(hitOverview(edges, november, 'all')).toEqual({ shots: 8, hits: 2, recorders: 1 });
  });

  it('部全体の推移は期間の長さで区切り、記録のない区切りは出さない', () => {
    const series = clubHitSeries(days, { from: '2026-11-01', to: '2026-11-28' }, 'all');

    expect(series.unit).toBe('week');
    expect(series.points.map((point) => [point.label, point.shots])).toEqual([['11/2', 64]]);
  });

  it('記録がない期間は比べられない', () => {
    expect(hitOverview(days, { from: '2026-10-01', to: '2026-10-31' }, 'all')).toBeNull();
  });
});
