import { describe, expect, it } from 'vitest';
import { judgeAttendance, type JudgementInput } from './attendance.ts';
import { toInstant } from './date.ts';
import { decideKomaRequest, upcomingKomaDays } from './koma-request.ts';
import type { NoticeContext } from './notice.ts';
import { resolvePracticePlan, type PracticeException } from './practice.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import {
  aMember,
  anException,
  aPunch,
  MONDAY,
  NO_KOMA,
  RULES,
  SATURDAY,
  TUESDAY,
} from './testing.ts';

/** 月曜は5コマあり（集合19:15、締め切り18:15） */
const KOMA = { ...NO_KOMA, mon5: true };
const BASE = { part: 'second', deadline: '19:15' } as const;

const context = (time: string, exceptions: PracticeException[] = []): NoticeContext => ({
  member: aMember(),
  now: toInstant(MONDAY, time),
  rules: RULES,
  koma: KOMA,
  exceptions,
  settings: DEFAULT_SETTINGS,
  enteredToday: false,
});

const requested = (approval: 'pending' | 'approved' | 'rejected') =>
  anException(MONDAY, 'no_koma', {
    memo: '休講',
    approval,
    selfSubmitted: true,
    basePlan: BASE,
  });

const submit = (time: string, kind: string = 'no_koma', reason = '休講') =>
  decideKomaRequest(context(time), { date: MONDAY, action: 'submit', kind, reason });

describe('コマ変更の申請', () => {
  it('変更前の集合の60分前まで受け付け、変更前の予定を残す', () => {
    expect(submit('18:15')).toEqual({
      ok: true,
      change: 'save',
      kind: 'no_koma',
      reason: '休講',
      base: BASE,
    });
    expect(submit('18:16')).toMatchObject({ ok: false });
  });

  it('今の予定と同じ内容と、理由のない申請は受け付けない', () => {
    expect(submit('12:00', 'koma5')).toMatchObject({ ok: false });
    expect(submit('12:00', 'no_koma', ' ')).toMatchObject({ ok: false });
  });

  it('締め切りを過ぎたら取り消せない', () => {
    const cancel = (time: string) =>
      decideKomaRequest(context(time, [requested('approved')]), {
        date: MONDAY,
        action: 'cancel',
      });

    expect(cancel('18:00')).toEqual({ ok: true, change: 'remove' });
    expect(cancel('18:30')).toMatchObject({ ok: false });
  });

  it('コマのある曜日だけで、土曜は申請できない', () => {
    const dates = upcomingKomaDays(context('12:00')).map((day) => day.date);

    expect(dates).toContain(TUESDAY);
    expect(dates).not.toContain(SATURDAY);
  });

  it('承認されるまで予定は変わらず、承認されると申請の内容になる', () => {
    const planWith = (approval: 'pending' | 'approved' | 'rejected') =>
      resolvePracticePlan({
        date: MONDAY,
        memberId: 'm1',
        rules: RULES,
        koma: KOMA,
        exceptions: [requested(approval)],
      });

    expect(planWith('pending')).toMatchObject({ deadline: '19:15', komaRequestPending: true });
    expect(planWith('rejected')).toMatchObject({ deadline: '19:15', komaRequestPending: false });
    expect(planWith('approved')).toMatchObject({ deadline: '17:00', part: 'first' });
  });

  it('承認した申請は、主将が入力した全員の臨時変更より優先する', () => {
    const plan = resolvePracticePlan({
      date: MONDAY,
      memberId: 'm1',
      rules: RULES,
      koma: KOMA,
      exceptions: [anException(MONDAY, 'koma5', { memberId: null }), requested('approved')],
    });

    expect(plan?.deadline).toBe('17:00');
  });
});

describe('申請があるときの判定', () => {
  const judge = (
    approval: 'pending' | 'approved' | 'rejected',
    time: string | null,
    recorded?: JudgementInput['recorded'],
  ) =>
    judgeAttendance({
      date: MONDAY,
      now: toInstant(MONDAY, '23:00'),
      member: aMember(),
      rules: RULES,
      koma: KOMA,
      exceptions: [requested(approval)],
      punches: time ? [aPunch(MONDAY, time)] : [],
      settings: DEFAULT_SETTINGS,
      recorded: recorded ?? null,
    });

  it('承認待ちの間は、遅刻と欠席の罰を保留する', () => {
    expect(judge('pending', '19:30:00')?.result).toBe('late_pending');
    expect(judge('pending', null)?.result).toBe('absent_pending');
    expect(judge('pending', '19:00:00')?.result).toBe('present');
  });

  it('過去の日を判定し直すと、承認なら申請の時刻、却下なら変更前の時刻になる', () => {
    const afterApproval = { part: 'first', deadline: '17:00' } as const;

    expect(judge('approved', '18:00:00', BASE)).toMatchObject({
      deadline: '17:00',
      result: 'late',
    });
    expect(judge('rejected', '18:00:00', afterApproval)).toMatchObject({
      deadline: '19:15',
      result: 'present',
    });
  });

  it('締め切り後の欠席の連絡があっても、申請が承認待ちなら保留する', () => {
    const record = judgeAttendance({
      date: MONDAY,
      now: toInstant(MONDAY, '23:00'),
      member: aMember(),
      rules: RULES,
      koma: KOMA,
      exceptions: [
        requested('pending'),
        anException(MONDAY, 'absent_notice', { contactedAt: toInstant(MONDAY, '19:00') }),
      ],
      punches: [],
      settings: DEFAULT_SETTINGS,
    });

    expect(record?.result).toBe('absent_pending');
  });
});
