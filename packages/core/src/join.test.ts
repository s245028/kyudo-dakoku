import { describe, expect, it } from 'vitest';
import { toInstant } from './date.ts';
import { decideJoin, upcomingJoinDays, type JoinContext } from './join.ts';
import type { PracticeException } from './practice.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { aMember, anException, MONDAY, NO_KOMA, RULES, TUESDAY } from './testing.ts';

const retired = aMember({ status: 'retired', retiredOn: '2026-10-01' });

const context = (time: string, exceptions: PracticeException[] = []): JoinContext => ({
  memberId: 'm1',
  now: toInstant(MONDAY, time),
  rules: RULES,
  koma: NO_KOMA,
  exceptions,
  settings: DEFAULT_SETTINGS,
});

const joined = [anException(MONDAY, 'join')];

const decide = (
  time: string,
  action: 'join' | 'cancel',
  exceptions: PracticeException[] = [],
  date: string = MONDAY,
) => decideJoin({ ...context(time, exceptions), member: retired, date, action });

describe('参加登録（受け入れテスト20）', () => {
  it('20: 集合の61分前は取り消せる', () => {
    expect(decide('15:59', 'cancel', joined)).toEqual({ ok: true, change: 'remove' });
  });

  it('20: 集合の59分前の取り消しは拒否する', () => {
    expect(decide('16:01', 'cancel', joined)).toMatchObject({ ok: false });
  });

  it('登録は集合時刻まで', () => {
    expect(decide('17:00', 'join')).toEqual({ ok: true, change: 'add' });
    expect(decide('17:01', 'join')).toMatchObject({ ok: false });
    expect(decide('17:01', 'join', joined)).toEqual({
      ok: false,
      message: '集合時刻を過ぎたので登録できません。',
    });
  });

  it('登録済みの登録と、未登録の取り消しは何もしない', () => {
    expect(decide('12:00', 'join', joined)).toEqual({ ok: true, change: 'none' });
    expect(decide('16:30', 'cancel')).toEqual({ ok: true, change: 'none' });
  });

  it('現役と、引退日より前の日は登録できない', () => {
    const input = { ...context('12:00'), action: 'join' as const, date: MONDAY };

    expect(decideJoin({ ...input, member: aMember() }).ok).toBe(false);
    expect(
      decideJoin({ ...input, member: aMember({ status: 'retired', retiredOn: TUESDAY }) }).ok,
    ).toBe(false);
  });

  it('今日から14日先までの練習日を返す', () => {
    const days = upcomingJoinDays(context('12:00'));

    expect(days[0]?.date).toBe(MONDAY);
    expect(days.at(-1)?.date).toBe('2026-12-14');
    expect(decide('12:00', 'join', [], '2026-12-15').ok).toBe(false);
  });

  it('休みの日と、過ぎて登録していない日は出さない', () => {
    const exceptions = [anException(TUESDAY, 'day_off', { memberId: null })];
    const dates = upcomingJoinDays(context('18:00', exceptions)).map((day) => day.date);

    expect(dates).not.toContain(MONDAY);
    expect(dates).not.toContain(TUESDAY);
  });
});
