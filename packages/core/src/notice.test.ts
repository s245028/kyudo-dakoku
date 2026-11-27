import { describe, expect, it } from 'vitest';
import { judgeAttendance } from './attendance.ts';
import { toInstant } from './date.ts';
import { aMember, anException, aPunch, MONDAY, NO_KOMA, RULES, TUESDAY } from './testing.ts';
import {
  decideNotice,
  upcomingNoticeDays,
  validateNoticeReview,
  type NoticeContext,
} from './notice.ts';
import { planAutoPenaltySync } from './penalty-sync.ts';
import { DEFAULT_PENALTY_TYPES, summarizePenalty } from './penalty.ts';
import type { PracticeException } from './practice.ts';
import { DEFAULT_SETTINGS } from './settings.ts';

const context = (
  time: string,
  exceptions: PracticeException[] = [],
  overrides: Partial<NoticeContext> = {},
): NoticeContext => ({
  member: aMember(),
  now: toInstant(MONDAY, time),
  rules: RULES,
  koma: NO_KOMA,
  exceptions,
  settings: DEFAULT_SETTINGS,
  enteredToday: false,
  ...overrides,
});

/** 本人がアプリから出した連絡。月曜の締め切りは16:00 */
const sent = (
  kind: 'absent_notice' | 'late_notice',
  approval: PracticeException['approval'],
  time = '15:00',
): PracticeException =>
  anException(MONDAY, kind, {
    memo: '授業のため',
    contactedAt: toInstant(MONDAY, time),
    approval: approval ?? null,
    selfSubmitted: true,
  });

const submit = (time: string, exceptions: PracticeException[] = [], reason = '授業のため') =>
  decideNotice(context(time, exceptions), {
    date: MONDAY,
    action: 'submit',
    kind: 'absent_notice',
    reason,
  });

const cancel = (time: string, exceptions: PracticeException[]) =>
  decideNotice(context(time, exceptions), { date: MONDAY, action: 'cancel' });

describe('連絡を送る', () => {
  it('締め切りまでは承認待ち、過ぎたら承認の対象外', () => {
    expect(submit('16:00')).toMatchObject({ ok: true, change: 'save', approval: 'pending' });
    expect(submit('16:01')).toMatchObject({ ok: true, change: 'save', approval: null });
  });

  it('理由は必須で、200文字まで', () => {
    expect(submit('12:00', [], '　 ')).toEqual({ ok: false, message: '理由を書いてください。' });
    expect(submit('12:00', [], 'あ'.repeat(201)).ok).toBe(false);
    expect(submit('12:00', [], ' 授業 ')).toMatchObject({ reason: '授業' });
  });

  it('締め切りまでは出し直しと取り消しができ、過ぎたらできない', () => {
    for (const approval of ['pending', 'approved', 'rejected'] as const) {
      const existing = [sent('absent_notice', approval)];

      expect(submit('16:00', existing).ok).toBe(true);
      expect(cancel('16:00', existing)).toEqual({ ok: true, change: 'remove' });
      expect(submit('16:01', existing).ok).toBe(false);
      expect(cancel('16:01', existing).ok).toBe(false);
    }
  });

  it('主将が入力した連絡は、本人は変えられない', () => {
    const entered = [anException(MONDAY, 'absent_notice')];

    expect(submit('12:00', entered)).toMatchObject({ ok: false });
    expect(cancel('12:00', entered)).toMatchObject({ ok: false });
  });

  it('今日の入室を記録したあとは送れない。先の日は送れる', () => {
    const days = upcomingNoticeDays(context('17:30', [], { enteredToday: true }));

    expect(days[0]).toMatchObject({ date: MONDAY, canSubmit: false });
    expect(days[1]).toMatchObject({ date: TUESDAY, canSubmit: true });
  });

  it('今日から14日先までの練習日で、休みの日は出さない', () => {
    const exceptions = [anException(TUESDAY, 'day_off', { memberId: null })];
    const dates = upcomingNoticeDays(context('12:00', exceptions)).map((day) => day.date);

    expect(dates).not.toContain(TUESDAY);
    expect(dates.at(-1)).toBe('2026-12-14');
  });

  it('引退した人は、参加を登録した日だけ', () => {
    const member = aMember({ status: 'retired', retiredOn: '2026-10-01' });
    const days = upcomingNoticeDays(context('12:00', [anException(TUESDAY, 'join')], { member }));

    expect(days.map((day) => day.date)).toEqual([TUESDAY]);
  });

  it('承認待ちの部員は送れない', () => {
    const member = aMember({ approved: false });

    expect(upcomingNoticeDays(context('12:00', [], { member }))).toEqual([]);
  });

  it('画面に出す状態を返す', () => {
    const stateOf = (notice: PracticeException) =>
      upcomingNoticeDays(context('12:00', [notice]))[0]?.notice?.state;

    expect(stateOf(sent('absent_notice', 'pending'))).toBe('pending');
    expect(stateOf(sent('absent_notice', 'rejected'))).toBe('rejected');
    expect(stateOf(sent('absent_notice', null, '16:30'))).toBe('overdue');
    expect(stateOf(anException(MONDAY, 'late_notice'))).toBe('approved');
  });
});

describe('承認の状態と判定', () => {
  const judge = (exceptions: PracticeException[], enteredAt: string | null, now = '23:00') =>
    judgeAttendance({
      date: MONDAY,
      now: toInstant(MONDAY, now),
      member: aMember(),
      rules: RULES,
      koma: NO_KOMA,
      exceptions,
      punches: enteredAt ? [aPunch(MONDAY, enteredAt)] : [],
      settings: DEFAULT_SETTINGS,
    });

  it('承認待ちは保留にする', () => {
    expect(judge([sent('absent_notice', 'pending')], null)?.result).toBe('absent_pending');
    expect(judge([sent('late_notice', 'pending')], '17:10:00')?.result).toBe('late_pending');
    expect(judge([sent('late_notice', 'pending')], null)?.result).toBe('absent_pending');
  });

  it('承認したら連絡済、却下したら連絡なしと同じ', () => {
    expect(judge([sent('absent_notice', 'approved')], null)?.result).toBe('absent_notified');
    expect(judge([sent('absent_notice', 'rejected')], null)?.result).toBe('absent_unexcused');
    expect(judge([sent('late_notice', 'rejected')], '17:10:00')?.result).toBe('late');
    expect(judge([sent('absent_notice', 'rejected')], null, '16:00')?.result).toBe('not_arrived');
  });

  it('締め切り後の連絡は連絡遅れ', () => {
    expect(judge([sent('absent_notice', null, '16:30')], null)?.result).toBe(
      'absent_notice_overdue',
    );
  });

  it('却下は備考に残す', () => {
    expect(judge([sent('absent_notice', 'rejected')], null)?.notes).toContain(
      '欠席連絡済（却下）：授業のため',
    );
  });

  it('時間内に来た人は、連絡の状態にかかわらず出席', () => {
    expect(judge([sent('absent_notice', 'pending')], '16:50:00')?.result).toBe('present');
  });

  it('記録済みの集合時刻を渡すと、今のコマ表に変えずに判定する', () => {
    const record = judgeAttendance({
      date: MONDAY,
      now: toInstant(TUESDAY, '12:00'),
      member: aMember(),
      rules: RULES,
      koma: { ...NO_KOMA, mon5: true },
      exceptions: [sent('late_notice', 'rejected')],
      punches: [aPunch(MONDAY, '17:10:00')],
      settings: DEFAULT_SETTINGS,
      recorded: { part: 'first', deadline: '17:00' },
    });

    expect(record).toMatchObject({ deadline: '17:00', result: 'late', lateMinutes: 10 });
  });

  it('保留の間は自動の罰をつけない', () => {
    const changes = planAutoPenaltySync({
      date: MONDAY,
      judged: [
        { memberId: 'm1', result: 'late_pending' },
        { memberId: 'm2', result: 'absent_pending' },
      ],
      existing: [],
      types: DEFAULT_PENALTY_TYPES,
    });

    expect(changes.create).toEqual([]);
  });
});

describe('却下が遅れた罰の数え方（受け入れテスト32）', () => {
  const created = (reviewedOn: string) =>
    planAutoPenaltySync({
      date: MONDAY,
      judged: [{ memberId: 'm1', result: 'absent_unexcused' }],
      existing: [],
      types: DEFAULT_PENALTY_TYPES,
      rejections: [{ memberId: 'm1', reviewedOn }],
    }).create[0]!;

  it('練習日より後の却下は、却下した日から数える', () => {
    const penalty = created('2026-12-10');
    const state = summarizePenalty({
      ...penalty,
      tasks: [],
      today: '2026-12-10',
      doublingDays: 7,
    });

    expect(penalty).toMatchObject({ date: MONDAY, countedFrom: '2026-12-10' });
    expect(state).toMatchObject({ remaining: 1, daysToDouble: 7 });
  });

  it('練習日までの却下は、練習日から数える', () => {
    expect(created(MONDAY).countedFrom).toBeUndefined();
  });
});

describe('承認の入力', () => {
  it('承認か却下だけを受け付け、却下の理由は任意', () => {
    expect(validateNoticeReview({ approval: 'pending' }).ok).toBe(false);
    expect(validateNoticeReview({ approval: 'rejected' })).toEqual({
      ok: true,
      value: { approval: 'rejected', rejectionReason: '' },
    });
    expect(validateNoticeReview({ approval: 'approved', rejectionReason: 'x' })).toMatchObject({
      value: { rejectionReason: '' },
    });
  });
});
