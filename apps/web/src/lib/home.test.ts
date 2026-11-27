import { toInstant } from '@kyudo/core';
import { describe, expect, it } from 'vitest';
import { describeHome, totalRemaining, type HomeData } from './home.ts';

const MONDAY = '2026-11-30';

const home: HomeData = {
  member: {
    id: 'm1',
    studentNo: 'S0001',
    name: '島根 太郎',
    grade: 'B1',
    gender: 'male',
    status: 'active',
    role: 'member',
    approved: true,
    retiredOn: null,
  },
  settings: {
    komaLocked: false,
    noticeLeadMinutes: 60,
    penaltyDoublingDays: 7,
    undoSeconds: 60,
    requiresLocation: false,
  },
  rules: [
    { weekday: 1, condition: 'no_koma', part: 'first', deadline: '17:00', startTime: '17:30' },
  ],
  koma: null,
  exceptions: [],
  punches: [{ id: 1, at: '2026-11-30T07:50:00Z', kind: 'in', canceledAt: null }],
  penalties: [
    {
      id: 'p1',
      date: '2026-11-16',
      memberId: 'm1',
      name: '島根 太郎',
      studentNo: 'S0001',
      reason: '遅刻',
      memo: '',
      baseCount: 1,
      tasks: [],
    },
  ],
};

const at = (date: string, time = '17:00') => toInstant(date, time);

describe('describeHome', () => {
  it('今日の予定、在室、罰の数を返す', () => {
    const view = describeHome(home, at(MONDAY));

    expect(view.plan?.deadline).toBe('17:00');
    expect(view.inRoomSince).toEqual(at(MONDAY, '16:50'));
    expect(totalRemaining(view.penalties)).toBe(4);
  });

  it('保存した内容を翌日に表示しても、前の日の打刻で在室にしない', () => {
    expect(describeHome(home, at('2026-12-01')).inRoomSince).toBeNull();
    expect(describeHome(home, at('2026-12-01')).todayPunches).toEqual([]);
  });

  it('今日の入退室を古い順に返し、取り消した打刻は含めない', () => {
    const punched: HomeData = {
      ...home,
      punches: [
        { id: 3, at: '2026-11-30T09:00:00Z', kind: 'in', canceledAt: null },
        { id: 1, at: '2026-11-30T07:50:00Z', kind: 'in', canceledAt: null },
        { id: 2, at: '2026-11-30T08:30:00Z', kind: 'out', canceledAt: null },
        { id: 4, at: '2026-11-30T09:10:00Z', kind: 'out', canceledAt: '2026-11-30T09:10:30Z' },
      ],
    };

    expect(describeHome(punched, at(MONDAY, '19:00')).todayPunches).toEqual([
      { at: at(MONDAY, '16:50'), kind: 'in' },
      { at: at(MONDAY, '17:30'), kind: 'out' },
      { at: at(MONDAY, '18:00'), kind: 'in' },
    ]);
  });

  it('引退した人は、参加を登録した日だけ予定を出す', () => {
    const retired: HomeData = { ...home, member: { ...home.member, status: 'retired' } };
    const joined: HomeData = {
      ...retired,
      exceptions: [{ date: MONDAY, memberId: 'm1', kind: 'join', memo: '', contactedAt: null }],
    };

    expect(describeHome(retired, at(MONDAY, '12:00')).plan).toBeNull();
    expect(describeHome(joined, at(MONDAY, '12:00')).plan?.deadline).toBe('17:00');
    expect(describeHome(retired, at(MONDAY, '12:00')).joinDays.length).toBeGreaterThan(0);
  });
});
