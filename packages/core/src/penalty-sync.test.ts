import { describe, expect, it } from 'vitest';
import { finalJudgement, judgeAttendance } from './attendance.ts';
import { toInstant } from './date.ts';
import { DEFAULT_PENALTY_TYPES } from './penalty.ts';
import { autoPenaltyKey, planAutoPenaltySync, type ExistingAutoPenalty } from './penalty-sync.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { aMember, anException, aPunch, MONDAY, NO_KOMA, RULES } from './testing.ts';

const sync = (
  result: Parameters<typeof planAutoPenaltySync>[0]['judged'][number]['result'],
  existing: ExistingAutoPenalty[] = [],
) =>
  planAutoPenaltySync({
    date: MONDAY,
    judged: [{ memberId: 'm1', result }],
    existing,
    types: DEFAULT_PENALTY_TYPES,
  });

const late = (overrides: Partial<ExistingAutoPenalty> = {}): ExistingAutoPenalty => ({
  id: 'p1',
  autoKey: autoPenaltyKey(MONDAY, 'm1'),
  reason: '遅刻',
  baseCount: 1,
  locked: false,
  ...overrides,
});

const nothing = { create: [], update: [], remove: [] };

function judgedResult(input: { time?: string; now?: string; join?: boolean; retired?: boolean }) {
  return (
    judgeAttendance({
      date: MONDAY,
      now: toInstant(MONDAY, input.now ?? '22:15'),
      member: input.retired ? aMember({ status: 'retired' }) : aMember(),
      rules: RULES,
      koma: NO_KOMA,
      exceptions: input.join ? [anException(MONDAY, 'join')] : [],
      punches: input.time ? [aPunch(MONDAY, input.time)] : [],
      settings: DEFAULT_SETTINGS,
    })?.result ?? null
  );
}

describe('判定から自動の罰を決める（受け入れテスト2・10・11・18・19）', () => {
  it.each([
    ['2: 遅刻はその場で1個', { time: '17:00:01', now: '17:00' }, '遅刻'],
    ['11: 夜の判定で無断欠席1個', {}, '無断欠席'],
    ['19: 参加登録して来ない引退者', { retired: true, join: true }, '無断欠席'],
  ])('%s', (_, input, reason) => {
    expect(sync(judgedResult(input)).create).toEqual([
      {
        autoKey: 'auto|2026-11-30|m1',
        memberId: 'm1',
        date: MONDAY,
        reason,
        baseCount: 1,
      },
    ]);
  });

  it.each([
    ['10: 未到着', { now: '21:59' }],
    ['18: 参加（登録なし）', { retired: true, time: '18:00:00' }],
    ['出席', { time: '16:00:00' }],
  ])('%s は罰なし', (_, input) => {
    expect(sync(judgedResult(input))).toEqual(nothing);
  });
});

describe('判定し直したときの罰', () => {
  it('17: 割り当て済みの罰は、出席に直しても消えない', () => {
    const result = finalJudgement('late', 'present');

    expect(sync(result, [late({ locked: true })])).toEqual(nothing);
  });

  it('割り当て済みの罰があれば、同じ日の罰を重ねてつけない', () => {
    expect(sync('absent_unexcused', [late({ locked: true })])).toEqual(nothing);
  });

  it('手を付けていない罰は、判定がなくなれば外す', () => {
    expect(sync('present', [late()]).remove).toEqual(['p1']);
    expect(sync(null, [late()]).remove).toEqual(['p1']);
  });

  it('理由が変われば付け替える', () => {
    expect(sync('late_notice_overdue', [late()]).update).toEqual([
      { id: 'p1', reason: '遅刻（連絡遅れ）', baseCount: 1 },
    ]);
  });

  it('同じ判定なら何もしない', () => {
    expect(sync('late', [late()])).toEqual(nothing);
  });
});
