import { describe, expect, it } from 'vitest';
import { addDays } from './date.ts';
import {
  cleanTaskContent,
  countPenalty,
  summarizePenalty,
  DEFAULT_PENALTY_TYPES,
  taskSuggestions,
  unassignedCount,
  validateNewPenalty,
} from './penalty.ts';

const GIVEN = '2026-12-28';
/** ついた日の `days` 日後 */
const on = (days: number) => addDays(GIVEN, days);

const count = (todayAfter: number, completedAfter: number[] = [], baseCount = 1) =>
  countPenalty({
    date: GIVEN,
    baseCount,
    completedOn: completedAfter.map(on),
    today: on(todayAfter),
    doublingDays: 7,
  });

describe('罰の残りの数（受け入れテスト13〜16）', () => {
  it('13: 消化なしの16日目は残り4個', () => {
    expect(count(16)).toEqual({ remaining: 4, paid: 0, daysToDouble: 5 });
  });

  it('14: 9日目に1個消化すると、14日目は残り2個', () => {
    expect(count(9, [9]).remaining).toBe(1);
    expect(count(14, [9])).toMatchObject({ remaining: 2, paid: 1 });
  });

  it('15: 倍になる当日の消化は、2倍にしてから差し引く', () => {
    expect(count(7, [7]).remaining).toBe(1);
  });

  it('倍になる前日の消化は、倍になる前に差し引く', () => {
    expect(count(7, [6]).remaining).toBe(0);
  });

  it('16: 3日目に消化すると消化済みで、あとから増えない', () => {
    expect(count(3, [3]).remaining).toBe(0);
    expect(count(70, [3]).remaining).toBe(0);
  });

  it.each([
    [0, 1],
    [6, 1],
    [7, 2],
    [14, 4],
    [21, 8],
  ])('%i日後は%i個', (days, remaining) => {
    expect(count(days).remaining).toBe(remaining);
  });

  it('基本の数が2個なら2個から倍になる。消化の順番は問わない', () => {
    expect(count(14, [8, 1], 2)).toMatchObject({ remaining: 2, paid: 2 });
  });

  it('先の日付の罰は基本の数のまま', () => {
    expect(count(-3)).toMatchObject({ remaining: 1, daysToDouble: 7 });
  });

  it('倍になる日数が0なら例外にする', () => {
    expect(() =>
      countPenalty({ date: GIVEN, baseCount: 1, completedOn: [], today: GIVEN, doublingDays: 0 }),
    ).toThrow(RangeError);
  });
});

describe('やること', () => {
  it('残り・未消化のやること・未割り当ての数をまとめる', () => {
    const state = summarizePenalty({
      date: GIVEN,
      baseCount: 1,
      tasks: [
        { id: 'a', content: '掃除', completedOn: on(9) },
        { id: 'b', content: '的貼り', completedOn: null },
      ],
      today: on(14),
      doublingDays: 7,
    });

    expect(state).toMatchObject({ remaining: 2, paid: 1, unassigned: 1 });
    expect(state.openTasks.map((task) => task.id)).toEqual(['b']);
  });

  it('割り当てていない数を数える', () => {
    expect(unassignedCount(4, 1)).toBe(3);
    expect(unassignedCount(1, 2)).toBe(0);
  });

  it('内容の空白を整えて60文字に切る', () => {
    expect(cleanTaskContent('  的貼り　 3個 ')).toBe('的貼り 3個');
    expect(cleanTaskContent('あ'.repeat(70))).toHaveLength(60);
  });

  it('候補は新しい順で重複なし', () => {
    expect(taskSuggestions(['掃除', '的貼り', '掃除', ''])).toEqual(['掃除', '的貼り']);
  });
});

describe('罰をつけるときの入力', () => {
  const input = {
    reason: '私物の出しっぱなし',
    date: GIVEN,
    memo: '',
    contents: ['道場の掃除'],
    types: DEFAULT_PENALTY_TYPES,
  };

  it('正しい入力を受け付ける', () => {
    expect(validateNewPenalty(input)).toMatchObject({ ok: true, value: { baseCount: 1 } });
  });

  it.each([
    [{ reason: 'ない理由' }, '罰の理由を選んでください。'],
    [{ date: '2026-02-30' }, '日付が正しくありません。'],
    [{ reason: 'その他', memo: ' ' }, '「その他」のときはメモに内容を書いてください。'],
    [{ contents: [' '] }, '罰1個ぶんの「やること」をすべて入力してください。'],
    [{ contents: ['a', 'b'] }, '罰1個ぶんの「やること」をすべて入力してください。'],
  ])('%o は拒否する', (change, message) => {
    expect(validateNewPenalty({ ...input, ...change })).toEqual({ ok: false, message });
  });
});
