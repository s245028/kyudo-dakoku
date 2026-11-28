import { describe, expect, it } from 'vitest';
import { judgeAttendance } from './attendance.ts';
import { toInstant } from './date.ts';
import { describeEvent, validateEvent } from './event.ts';
import { upcomingKomaDays } from './koma-request.ts';
import { upcomingNoticeDays } from './notice.ts';
import { practiceParts } from './participants.ts';
import { resolvePracticePlan, type PracticeException } from './practice.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { aMember, anException, aPunch, MONDAY, NO_KOMA, RULES, WEDNESDAY } from './testing.ts';

const event = {
  title: '年末大射会',
  deadline: '09:00',
  startTime: '09:30',
  endTime: '15:00',
  shots: 20,
  memo: '的前',
};

const eventDay = (date: string): PracticeException =>
  anException(date, 'event', { memberId: null, event });

const plan = (date: string, exceptions: PracticeException[], koma = { ...NO_KOMA, mon5: true }) =>
  resolvePracticePlan({ date, memberId: 'm1', rules: RULES, koma, exceptions });

describe('行事の日の予定', () => {
  it('曜日のルールとコマ表より、行事の時刻を使う', () => {
    expect(plan(MONDAY, [eventDay(MONDAY)])).toMatchObject({
      part: 'whole',
      deadline: '09:00',
      startTime: '09:30',
      endTime: '15:00',
      event,
      notes: ['行事：年末大射会'],
    });
    expect(plan(MONDAY, [])).toMatchObject({ part: 'second', event: null });
  });

  it('練習のない曜日も、行事があれば練習日になる', () => {
    expect(plan(WEDNESDAY, [])).toBeNull();
    expect(plan(WEDNESDAY, [eventDay(WEDNESDAY)])).toMatchObject({ deadline: '09:00' });
  });

  it('同じ日の全員の休みより優先し、個人の公欠は判定しない', () => {
    const exceptions = [
      eventDay(MONDAY),
      anException(MONDAY, 'day_off', { memberId: null }),
      anException(MONDAY, 'day_off'),
    ];

    expect(plan(MONDAY, exceptions)).toMatchObject({ deadline: '09:00', exempt: true });
  });

  it('立ち順は全体の1区分', () => {
    expect(practiceParts(MONDAY, RULES, [eventDay(MONDAY)])).toEqual(['whole']);
    expect(practiceParts(WEDNESDAY, RULES, [eventDay(WEDNESDAY)])).toEqual(['whole']);
  });

  it('行事の集合時刻で遅刻を判定する', () => {
    const judge = (time: string) =>
      judgeAttendance({
        date: MONDAY,
        now: toInstant(MONDAY, '10:00'),
        member: aMember(),
        rules: RULES,
        koma: NO_KOMA,
        exceptions: [eventDay(MONDAY)],
        punches: [aPunch(MONDAY, time)],
        settings: DEFAULT_SETTINGS,
      })?.result;

    expect([judge('09:00:00'), judge('09:00:01')]).toEqual(['present', 'late']);
  });

  it('連絡は行事の集合時刻が基準で、コマ変更の申請は出せない', () => {
    const context = {
      member: aMember(),
      now: toInstant(MONDAY, '07:00'),
      rules: RULES,
      koma: NO_KOMA,
      exceptions: [eventDay(MONDAY)],
      settings: DEFAULT_SETTINGS,
      enteredToday: false,
    };

    expect(upcomingNoticeDays(context)[0]).toMatchObject({
      date: MONDAY,
      deadline: '09:00',
      event,
    });
    expect(upcomingKomaDays(context).map((day) => day.date)).not.toContain(MONDAY);
  });
});

describe('行事の入力', () => {
  const input = {
    date: '2026-12-26',
    title: ' 年末大射会 ',
    deadline: '09:00',
    startTime: '09:30',
    endTime: '',
    shots: '',
    memo: ' 的前 ',
  };
  const validate = (change: object = {}, allowPast = false) =>
    validateEvent({ ...input, ...change }, { today: '2026-11-28', allowPast });

  it('終了と射数は空でもよい', () => {
    expect(validate()).toEqual({
      ok: true,
      value: {
        date: '2026-12-26',
        event: {
          title: '年末大射会',
          deadline: '09:00',
          startTime: '09:30',
          endTime: null,
          shots: null,
          memo: '的前',
        },
      },
    });
  });

  it.each([
    { title: ' ' },
    { title: 'あ'.repeat(31) },
    { date: '' },
    { deadline: '' },
    { startTime: '25:00' },
    { endTime: '09:30' },
    { shots: '0' },
    { shots: '201' },
    { shots: '4.5' },
  ])('%o は拒否する', (change) => {
    expect(validate(change).ok).toBe(false);
  });

  it('過ぎた日は主将と管理者だけ', () => {
    expect(validate({ date: '2026-11-27' }).ok).toBe(false);
    expect(validate({ date: '2026-11-27' }, true).ok).toBe(true);
  });

  it('時刻と射数をまとめて表示する', () => {
    expect(describeEvent(event)).toBe('09:00集合・09:30開始・15:00終了・20射');
    expect(describeEvent({ ...event, endTime: null, shots: null })).toBe('09:00集合・09:30開始');
  });
});
