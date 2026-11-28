import { describe, expect, it } from 'vitest';
import {
  finalJudgement,
  GROUP_JUDGEMENTS,
  groupAttendance,
  JUDGEMENTS,
  judgeAttendance,
  type JudgementInput,
} from './attendance.ts';
import { toInstant } from './date.ts';
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
  WEDNESDAY,
} from './testing.ts';

function judge(overrides: Partial<JudgementInput> = {}) {
  const date = overrides.date ?? MONDAY;
  return judgeAttendance({
    date,
    now: toInstant(date, '21:00'),
    member: aMember(),
    rules: RULES,
    koma: NO_KOMA,
    exceptions: [],
    punches: [],
    settings: DEFAULT_SETTINGS,
    ...overrides,
  });
}

const afterNightly = (date: string) => toInstant(date, '22:15');

describe('集合時刻と遅刻（受け入れテスト1〜5）', () => {
  it('1: 月曜・コマなしの現役が16:59:59に入室すると出席', () => {
    const record = judge({ punches: [aPunch(MONDAY, '16:59:59')] });

    expect(record).toMatchObject({ part: 'first', deadline: '17:00', result: 'present' });
  });

  it('集合時刻ちょうど（秒未満の端数を含む）は出席', () => {
    const punch = aPunch(MONDAY, '17:00:00');
    punch.at = new Date(punch.at.getTime() + 999);

    expect(judge({ punches: [punch] })?.result).toBe('present');
  });

  it('2: 17:00:01に入室すると遅刻1分', () => {
    const record = judge({ punches: [aPunch(MONDAY, '17:00:01')] });

    expect(record).toMatchObject({ result: 'late', lateMinutes: 1 });
  });

  it('3: 火曜・5コマありは後半の19:15が基準', () => {
    const record = judge({
      date: TUESDAY,
      koma: { ...NO_KOMA, tue5: true },
      punches: [aPunch(TUESDAY, '19:16:00')],
    });

    expect(record).toMatchObject({
      part: 'second',
      deadline: '19:15',
      result: 'late',
      lateMinutes: 1,
    });
  });

  it('4: 4コマのみは17:20に入室しても出席', () => {
    const record = judge({
      koma: { ...NO_KOMA, mon4: true },
      punches: [aPunch(MONDAY, '17:20:00')],
    });

    expect(record).toMatchObject({ deadline: '17:30', result: 'present' });
  });

  it('5: 土曜の08:21は遅刻1分', () => {
    const record = judge({
      date: SATURDAY,
      koma: null,
      punches: [aPunch(SATURDAY, '08:21:00')],
    });

    expect(record).toMatchObject({ part: 'whole', result: 'late', lateMinutes: 1, notes: [] });
  });

  it('判定には最初の入室だけを使う', () => {
    const record = judge({
      punches: [
        aPunch(MONDAY, '18:00:00'),
        aPunch(MONDAY, '16:00:00'),
        aPunch(MONDAY, '16:30:00', 'out'),
      ],
    });

    expect(record).toMatchObject({ result: 'present', minutes: 210 });
    expect(record?.firstIn).toEqual(toInstant(MONDAY, '16:00'));
    expect(record?.lastOut).toEqual(toInstant(MONDAY, '16:30'));
  });

  it('取り消した打刻と他人の打刻は使わない', () => {
    const record = judge({
      punches: [
        aPunch(MONDAY, '16:00:00', 'in', { canceledAt: toInstant(MONDAY, '16:00') }),
        aPunch(MONDAY, '16:00:00', 'in', { memberId: 'other' }),
        aPunch(MONDAY, '17:10:00'),
      ],
    });

    expect(record).toMatchObject({ result: 'late', lateMinutes: 10 });
  });
});

describe('臨時変更（受け入れテスト6・12）', () => {
  it('6: 「4・5コマなし」と「4コマあり」が同じ日なら17:30が基準', () => {
    const record = judge({
      koma: { ...NO_KOMA, mon5: true },
      exceptions: [anException(MONDAY, 'koma4'), anException(MONDAY, 'no_koma')],
    });

    expect(record).toMatchObject({ deadline: '17:30', notes: ['予定の変更あり'] });
  });

  it('全員の変更と個人の変更を重ねる', () => {
    const record = judge({
      koma: { ...NO_KOMA, mon4: true },
      exceptions: [
        anException(MONDAY, 'no_koma', { memberId: null }),
        anException(MONDAY, 'koma5', { memo: '補講' }),
      ],
    });

    expect(record).toMatchObject({
      deadline: '19:15',
      notes: ['予定の変更あり', '5コマあり：補講'],
    });
  });

  it('ほかの日と他人の臨時変更は使わない', () => {
    const record = judge({
      exceptions: [
        anException(TUESDAY, 'koma5'),
        anException(MONDAY, 'koma5', { memberId: 'other' }),
      ],
    });

    expect(record).toMatchObject({ deadline: '17:00', notes: [] });
  });

  it('コマ表がなければ「4・5コマなし」とし、備考に残す', () => {
    expect(judge({ koma: null })).toMatchObject({ deadline: '17:00', notes: ['コマ表未登録'] });
  });

  it('12: 全員の「休み」がある日は誰も判定しない', () => {
    const exceptions = [anException(MONDAY, 'day_off', { memberId: null })];

    expect(judge({ exceptions, punches: [aPunch(MONDAY, '18:00:00')] })).toBeNull();
  });

  it('個人の「休み」は対象外', () => {
    const exceptions = [anException(MONDAY, 'day_off')];

    expect(judge({ exceptions, now: afterNightly(MONDAY) })?.result).toBe('exempt');
  });

  it('ルールのない曜日は練習日ではない', () => {
    expect(judge({ date: WEDNESDAY })).toBeNull();
  });
});

describe('欠席と連絡（受け入れテスト7〜11）', () => {
  const lateWithNotice = (contactedAt: string) =>
    judge({
      exceptions: [anException(MONDAY, 'late_notice', { contactedAt: new Date(contactedAt) })],
      punches: [aPunch(MONDAY, '17:30:00')],
    });

  it('7: 集合の60分前ちょうどの連絡は遅刻（連絡済）', () => {
    expect(lateWithNotice('2026-11-30T16:00:00+09:00')?.result).toBe('late_notified');
  });

  it('連絡日時は分の単位で比べる', () => {
    expect(lateWithNotice('2026-11-30T16:00:59+09:00')?.result).toBe('late_notified');
  });

  it('8: 集合の59分前の連絡は遅刻（連絡遅れ）', () => {
    expect(lateWithNotice('2026-11-30T16:01:00+09:00')?.result).toBe('late_notice_overdue');
  });

  it('9: 欠席連絡済で連絡日時が空欄なら欠席（連絡済）として備考に残す', () => {
    const record = judge({
      now: afterNightly(MONDAY),
      exceptions: [anException(MONDAY, 'absent_notice')],
    });

    expect(record?.result).toBe('absent_notified');
    expect(record?.notes.join()).toContain('連絡日時が未入力');
  });

  it('欠席の連絡が締め切り後なら欠席（連絡遅れ）', () => {
    const record = judge({
      exceptions: [
        anException(MONDAY, 'absent_notice', { contactedAt: toInstant(MONDAY, '16:30') }),
      ],
    });

    expect(record?.result).toBe('absent_notice_overdue');
  });

  it('遅刻の連絡だけで来ていない人は、夜まで未到着、そのあと欠席', () => {
    const exceptions = [
      anException(MONDAY, 'late_notice', { contactedAt: toInstant(MONDAY, '12:00') }),
    ];

    expect(judge({ exceptions })?.result).toBe('not_arrived');
    expect(judge({ exceptions, now: afterNightly(MONDAY) })?.result).toBe('absent_notified');
  });

  it('10: 当日の21:59はまだ未到着', () => {
    expect(judge({ now: toInstant(MONDAY, '21:59') })?.result).toBe('not_arrived');
  });

  it('11: 夜の判定後は無断欠席', () => {
    expect(judge({ now: toInstant(MONDAY, '22:00') })?.result).toBe('absent_unexcused');
    expect(judge({ now: toInstant(TUESDAY, '09:00') })?.result).toBe('absent_unexcused');
  });

  it('先の日付は無断欠席にしない', () => {
    expect(judge({ date: TUESDAY, now: toInstant(MONDAY, '23:00') })?.result).toBe('not_arrived');
  });
});

describe('引退した人と部員の状態（受け入れテスト18・19・21）', () => {
  const retired = aMember({ status: 'retired', retiredOn: MONDAY });

  it('18: 参加登録なしで来たら参加（登録なし）', () => {
    const record = judge({ member: retired, punches: [aPunch(MONDAY, '18:00:00')] });

    expect(record).toMatchObject({ result: 'unregistered', lateMinutes: null });
  });

  it('参加登録せず来ていなければ載せない', () => {
    expect(judge({ member: retired, now: afterNightly(MONDAY) })).toBeNull();
  });

  it('19: 参加登録して来なければ無断欠席', () => {
    const record = judge({
      member: retired,
      exceptions: [anException(MONDAY, 'join')],
      now: afterNightly(MONDAY),
    });

    expect(record?.result).toBe('absent_unexcused');
  });

  it('21: 引退日より前の日は現役として判定する', () => {
    const record = judge({
      member: aMember({ status: 'retired', retiredOn: TUESDAY }),
      now: afterNightly(MONDAY),
    });

    expect(record?.result).toBe('absent_unexcused');
  });

  it.each([
    aMember({ status: 'suspended' }),
    aMember({ status: 'graduated' }),
    aMember({ approved: false }),
  ])('判定しない部員: %o', (member) => {
    expect(judge({ member, now: afterNightly(MONDAY) })).toBeNull();
  });
});

describe('在室時間と自動退室（受け入れテスト24）', () => {
  it('24: 自動退室は備考に残し、判定に影響しない', () => {
    const record = judge({
      now: afterNightly(MONDAY),
      punches: [aPunch(MONDAY, '16:50:00'), aPunch(MONDAY, '22:00:00', 'auto_out')],
    });

    expect(record).toMatchObject({ result: 'present', minutes: 310, notes: ['退室打刻なし'] });
  });

  it('当日の入室中は今までの時間を数える', () => {
    expect(judge({ punches: [aPunch(MONDAY, '20:00:00')] })?.minutes).toBe(60);
  });
});

describe('練習の終了後の入室（受け入れテスト51〜52）', () => {
  const rules = RULES.map((rule) => ({
    ...rule,
    endTime: rule.part === 'second' ? '21:30' : '19:30',
  }));
  const enter = (time: string, overrides: Partial<JudgementInput> = {}) =>
    judge({ rules, punches: [aPunch(MONDAY, time)], ...overrides });

  it('51: 終了の時刻までの入室は遅刻、過ぎると無断欠席', () => {
    expect(enter('19:30:00')).toMatchObject({ result: 'late', lateMinutes: 150 });
    expect(enter('19:30:01')).toMatchObject({
      result: 'absent_unexcused',
      lateMinutes: null,
      notes: ['練習の終了後に入室（19:30）'],
    });
  });

  it('遅刻の連絡があれば、欠席の連絡として扱う', () => {
    const exceptions = [
      anException(MONDAY, 'late_notice', { contactedAt: toInstant(MONDAY, '15:00') }),
    ];

    expect(enter('20:00:00', { exceptions })?.result).toBe('absent_notified');
  });

  it('52: 来ていない人は、終了の時刻で欠席が確定する', () => {
    const at = (time: string) => judge({ rules, now: toInstant(MONDAY, time) })?.result;

    expect(at('19:29')).toBe('not_arrived');
    expect(at('19:30')).toBe('absent_unexcused');
  });

  it('終了の時刻を決めていなければ、後からの入室は遅刻', () => {
    expect(judge({ punches: [aPunch(MONDAY, '21:00:00')] })?.result).toBe('late');
  });

  it('記録した区分で判定し直すときは、その区分の終了の時刻を使う', () => {
    const recorded = { part: 'second' as const, deadline: '19:15' };

    expect(enter('20:00:00', { recorded })?.result).toBe('late');
  });
});

describe('出欠一覧の分け方', () => {
  const entry = (memberId: string, finalResult: (typeof JUDGEMENTS)[number]) => ({
    memberId,
    finalResult,
  });

  it('どの判定も、どれか1つの分け方に入る', () => {
    expect(Object.values(GROUP_JUDGEMENTS).flat().sort()).toEqual([...JUDGEMENTS].sort());
  });

  it('判定ごとにまとめ、該当者のいない判定は出さない', () => {
    const groups = groupAttendance(
      [
        entry('a', 'late'),
        entry('b', 'absent_unexcused'),
        entry('c', 'late'),
        entry('d', 'present'),
      ],
      [],
    );

    expect(groups.unnotified.map((section) => [section.label, section.entries.length])).toEqual([
      ['無断欠席', 1],
      ['遅刻', 2],
    ]);
    expect(groups.notified).toEqual([]);
    expect(groups.present).toHaveLength(1);
  });

  it('遅刻の連絡をして来ていない人は、連絡あり。却下した連絡は数えない', () => {
    const groups = groupAttendance(
      [entry('a', 'not_arrived'), entry('b', 'not_arrived')],
      [
        { memberId: 'a', kind: 'late_notice', approval: 'pending' },
        { memberId: 'b', kind: 'late_notice', approval: 'rejected' },
      ],
    );

    expect(groups.notified).toMatchObject([
      { label: '未到着（遅刻の連絡あり）', entries: [{ memberId: 'a' }] },
    ]);
    expect(groups.unnotified).toMatchObject([{ label: '未到着', entries: [{ memberId: 'b' }] }]);
  });
});

describe('finalJudgement', () => {
  it('手動判定を優先する', () => {
    expect(finalJudgement('late', 'present')).toBe('present');
    expect(finalJudgement('late', null)).toBe('late');
  });
});
