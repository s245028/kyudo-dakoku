import { describe, expect, it } from 'vitest';
import {
  canCorrectHits,
  countRows,
  describeTally,
  displayRows,
  emptyRow,
  formatHitRate,
  hitEditRefusal,
  mergesIntoHistory,
  nextShot,
  planHitChange,
  validateHitDate,
  validateHitEntry,
  validateTally,
  type HitContent,
  type ShotRow,
} from './hit.ts';
import type { Role } from './member.ts';
import { aMember } from './testing.ts';

const total = (shots: number, hits: number): HitContent => ({
  mode: 'total',
  rows: null,
  shots,
  hits,
});

describe('一射ずつの入力', () => {
  it('欄を押すたびに、未入力・中り・外れの順に変わる', () => {
    expect([nextShot(null), nextShot(1), nextShot(0)]).toEqual([1, 0, null]);
  });

  it('入力した射だけを数える', () => {
    expect(
      countRows([
        [1, 0, 1, 1],
        [1, null, 0, null],
      ]),
    ).toEqual({ shots: 6, hits: 4 });
  });

  it('はじめは1段で、4射とも入れると次の段が出る', () => {
    expect(displayRows([])).toEqual([emptyRow()]);
    expect(displayRows([[1, 1, 0, null]])).toHaveLength(1);
    expect(displayRows([[1, 1, 0, 0]])).toEqual([[1, 1, 0, 0], emptyRow()]);
  });

  it('途中で終えた段のあとに、段を足せる', () => {
    expect(displayRows([[1, 1, null, null]], 2)).toEqual([[1, 1, null, null], emptyRow()]);
  });

  it('段は50（200射）まで', () => {
    const rows = Array.from({ length: 50 }, (): ShotRow => [1, 1, 1, 1]);

    expect(displayRows(rows, 60)).toHaveLength(50);
  });
});

describe('合計の入力', () => {
  it.each([
    [1, 0],
    [40, 40],
    [200, 120],
  ])('%i射%i中は受け付ける', (shots, hits) => {
    expect(validateTally(shots, hits).ok).toBe(true);
  });

  it.each([
    [0, 0],
    [201, 1],
    [4, 5],
    [4, -1],
    [4.5, 1],
    [4, 1.5],
    ['4', 1],
    [4, null],
  ])('%o射%o中は拒否する', (shots, hits) => {
    expect(validateTally(shots, hits).ok).toBe(false);
  });
});

describe('保存の依頼', () => {
  const entry = (input: object) => validateHitEntry({ category: 'drill', ...input });

  it('一射ずつは後ろの空の段を除いて数える', () => {
    const result = entry({ mode: 'shots', rows: [[1, 0, null, null], emptyRow()] });

    expect(result).toMatchObject({
      ok: true,
      value: { content: { shots: 2, hits: 1, rows: [[1, 0, null, null]] }, baseRevision: null },
    });
  });

  it('1射も入っていなければ削除', () => {
    expect(entry({ mode: 'shots', rows: [emptyRow()], baseRevision: 3 })).toMatchObject({
      ok: true,
      value: { content: null, baseRevision: 3 },
    });
  });

  it.each([
    { mode: 'shots', rows: [[1, 0]] },
    { mode: 'shots', rows: [[1, 0, 2, 1]] },
    { mode: 'shots' },
    { mode: 'total', shots: 4, hits: 5 },
    { mode: 'other' },
    { mode: 'total', shots: 4, hits: 1, baseRevision: '1' },
    { category: 'practice', mode: 'total', shots: 4, hits: 1 },
  ])('%o は拒否する', (input) => {
    expect(entry(input).ok).toBe(false);
  });

  it('201射は拒否する', () => {
    const rows = Array.from({ length: 51 }, () => [1, 1, 1, 1]);

    expect(entry({ mode: 'shots', rows }).ok).toBe(false);
  });
});

describe('記録できる日', () => {
  const check = (date: string, startDate: string | null = '2026-11-01') =>
    validateHitDate(date, { startDate, today: '2026-11-28' }).ok;

  it('開始日から今日まで', () => {
    expect([check('2026-10-31'), check('2026-11-01'), check('2026-11-28')]).toEqual([
      false,
      true,
      true,
    ]);
    expect(check('2026-11-29')).toBe(false);
  });

  it('開始日が決まるまでは記録できない', () => {
    expect(check('2026-11-28', null)).toBe(false);
  });
});

describe('同じ記録を直すとき', () => {
  const existing = { ...total(20, 11), revision: 5 };

  it('見ていた内容のままなら保存・削除する', () => {
    expect(planHitChange(existing, { content: total(24, 12), baseRevision: 5 })).toBe('save');
    expect(planHitChange(existing, { content: null, baseRevision: 5 })).toBe('delete');
    expect(planHitChange(null, { content: total(4, 1), baseRevision: null })).toBe('save');
  });

  it('ほかで変わっていたら上書きしない', () => {
    expect(planHitChange(existing, { content: total(24, 12), baseRevision: 4 })).toBe('conflict');
    expect(planHitChange(existing, { content: total(24, 12), baseRevision: null })).toBe(
      'conflict',
    );
    expect(planHitChange(null, { content: total(24, 12), baseRevision: 5 })).toBe('conflict');
    expect(planHitChange(existing, { content: null, baseRevision: 4 })).toBe('conflict');
  });

  it('同じ内容の送り直しは、二重に足さず何もしない', () => {
    expect(planHitChange(existing, { content: total(20, 11), baseRevision: null })).toBe('noop');
    expect(planHitChange(null, { content: null, baseRevision: 5 })).toBe('noop');
  });
});

describe('記録の権限', () => {
  const as = (role: Role, isAdmin = false) => ({ ...aMember(), role, isAdmin });

  it('ほかの部員の記録を直せるのは副務と管理者で、主将はできない', () => {
    expect(canCorrectHits(as('vice'))).toBe(true);
    expect(canCorrectHits(as('member', true))).toBe(true);
    expect(canCorrectHits(as('captain'))).toBe(false);
  });

  const refusal = (own: boolean, actorCanCorrect: boolean, creating: boolean) =>
    hitEditRefusal({ own, actorMayRecord: true, actorCanCorrect, creating });

  it('本人は足せて直せる。ほかの人の分は、直せる人が訂正と削除だけできる', () => {
    expect(refusal(true, false, true)).toBeNull();
    expect(refusal(false, true, false)).toBeNull();
    expect(refusal(false, true, true)).not.toBeNull();
    expect(refusal(false, false, false)).not.toBeNull();
  });

  it('承認前は自分の記録もつけられない', () => {
    expect(
      hitEditRefusal({
        own: true,
        actorMayRecord: false,
        actorCanCorrect: false,
        creating: true,
      }),
    ).not.toBeNull();
  });
});

describe('変更の履歴', () => {
  const now = new Date('2026-11-28T10:00:00+09:00');
  const merges = (
    minutes: number,
    overrides: { changedBy?: string; hasAfter?: boolean; deleting?: boolean } = {},
  ) =>
    mergesIntoHistory({
      latest: {
        changedBy: overrides.changedBy ?? 'a',
        changedAt: new Date(now.getTime() - minutes * 60_000),
        hasAfter: overrides.hasAfter ?? true,
      },
      actorId: 'a',
      now,
      deleting: overrides.deleting ?? false,
    });

  it('同じ人が5分未満で続けて直した分は1件にする', () => {
    expect([merges(4.9), merges(5)]).toEqual([true, false]);
  });

  it('ほかの人の変更、削除、削除のあとはまとめない', () => {
    expect(merges(1, { changedBy: 'b' })).toBe(false);
    expect(merges(1, { deleting: true })).toBe(false);
    expect(merges(1, { hasAfter: false })).toBe(false);
  });
});

describe('表示', () => {
  it('的中率は小数1桁、引いていなければ棒', () => {
    expect(formatHitRate({ shots: 312, hits: 178 })).toBe('57.1%');
    expect(formatHitRate({ shots: 0, hits: 0 })).toBe('―');
    expect(describeTally({ shots: 16, hits: 9 })).toBe('16射9中');
    expect(describeTally(null)).toBe('なし');
  });
});
