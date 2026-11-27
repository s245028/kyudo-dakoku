import { describe, expect, it } from 'vitest';
import {
  previousPenaltyAmounts,
  summarizePenaltyStats,
  type PenaltyRecord,
} from './penalty-stats.ts';

let sequence = 0;

function record(overrides: Partial<PenaltyRecord> & { done?: string[] }): PenaltyRecord {
  const { done = [], ...rest } = overrides;
  sequence += 1;
  return {
    id: `p${sequence}`,
    memberId: 'a',
    date: '2026-11-10',
    reason: '遅刻',
    baseCount: 1,
    countedFrom: null,
    canceled: false,
    completed: false,
    tasks: done.map((completedOn, index) => ({ id: `t${index}`, content: '', completedOn })),
    ...rest,
  };
}

const summarize = (records: PenaltyRecord[]) =>
  summarizePenaltyStats({
    records,
    period: { from: '2026-11-01', to: '2026-11-28' },
    today: '2026-11-28',
    doublingDays: 14,
  });

describe('summarizePenaltyStats', () => {
  it('つけた数は期間内の日付の基本の数で、残りは倍になった分を含む', () => {
    const { totals } = summarize([record({ date: '2026-11-10', baseCount: 2 })]);
    expect(totals).toEqual({ added: 2, done: 0, remaining: 4 });
  });

  it('期間より前の罰は、消化した分と残りだけを数える', () => {
    const { totals, byReason } = summarize([
      record({ date: '2026-10-30', baseCount: 3, done: ['2026-10-31', '2026-11-02'] }),
    ]);
    expect(totals).toEqual({ added: 0, done: 1, remaining: 4 });
    expect(byReason).toEqual([]);
  });

  it('取り消した罰は数えない', () => {
    const stats = summarize([record({ canceled: true, completed: true })]);
    expect(stats.totals).toEqual({ added: 0, done: 0, remaining: 0 });
    expect(stats.byMember).toEqual([]);
  });

  it('終わった罰の残りは0。期間に関係のない終わった罰は内訳に出さない', () => {
    const stats = summarize([
      record({ date: '2026-09-01', completed: true, done: ['2026-09-02'] }),
      record({ memberId: 'b', completed: true, done: ['2026-11-11'] }),
    ]);
    expect(stats.totals).toEqual({ added: 1, done: 1, remaining: 0 });
    expect(stats.byMember.map((member) => member.memberId)).toEqual(['b']);
  });

  it('推移は区切りごと、理由は多い順、部員は内訳を古い順にまとめる', () => {
    const stats = summarize([
      record({ date: '2026-11-17', reason: '無断欠席', baseCount: 3, done: ['2026-11-24'] }),
      record({ date: '2026-11-03' }),
      record({ memberId: 'b', date: '2026-11-04' }),
    ]);
    expect(stats.unit).toBe('week');
    expect(stats.trend.map(({ added, done }) => [added, done])).toEqual([
      [0, 0],
      [2, 0],
      [0, 0],
      [3, 0],
      [0, 1],
    ]);
    expect(stats.byReason).toEqual([
      { reason: '無断欠席', added: 3 },
      { reason: '遅刻', added: 2 },
    ]);
    const a = stats.byMember.find((member) => member.memberId === 'a')!;
    expect(a.added).toBe(4);
    expect(a.details.map((detail) => detail.date)).toEqual(['2026-11-03', '2026-11-17']);
  });
});

describe('previousPenaltyAmounts', () => {
  const period = { from: '2026-10-01', to: '2026-10-28' };

  it('比べる期間の、つけた数と消化した数', () => {
    const records = [record({ date: '2026-10-05', baseCount: 2, done: ['2026-10-06'] })];
    expect(previousPenaltyAmounts(records, period)).toEqual({ added: 2, done: 1 });
  });

  it('それより前に記録があれば0個、まだなければ比べない', () => {
    expect(previousPenaltyAmounts([record({ date: '2026-09-01' })], period)).toEqual({
      added: 0,
      done: 0,
    });
    expect(previousPenaltyAmounts([record({ date: '2026-11-01' })], period)).toBeNull();
    expect(
      previousPenaltyAmounts([record({ date: '2026-09-01', canceled: true })], period),
    ).toBeNull();
  });
});
