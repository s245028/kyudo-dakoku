import { describe, expect, it } from 'vitest';
import { judgeAttendance } from './attendance.ts';
import { toInstant } from './date.ts';
import { checkLocation } from './location.ts';
import { DEFAULT_PENALTY_TYPES } from './penalty.ts';
import { autoPenaltyKey, planAutoPenaltySync } from './penalty-sync.ts';
import { resolvePracticePlan } from './practice.ts';
import {
  decideScan,
  describeFirstEntry,
  isEntranceQr,
  planAutoCheckout,
  presentMembers,
  punchRefusal,
  undoRefusal,
} from './scan.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { aMember, aPunch, MONDAY, NO_KOMA, RULES, TUESDAY } from './testing.ts';

const at = (time: string) => aPunch(MONDAY, time).at;

describe('打刻できる人（受け入れテスト25）', () => {
  it('25: 承認待ちの人は拒否する', () => {
    expect(punchRefusal(aMember({ approved: false }))).toContain('主将の承認待ちです');
  });

  it('休部・退部と卒業の人は拒否する', () => {
    expect(punchRefusal(aMember({ status: 'suspended' }))).toContain('休部・退部のため');
    expect(punchRefusal(aMember({ status: 'graduated' }))).toContain('卒業のため');
  });

  it('現役と引退は打刻できる', () => {
    expect(punchRefusal(aMember())).toBeNull();
    expect(punchRefusal(aMember({ status: 'retired' }))).toBeNull();
  });
});

describe('入口の QR', () => {
  const settings = { entranceQr: 'TEST-QR' };

  it('設定と一致するときだけ受け付ける', () => {
    expect(isEntranceQr(' TEST-QR\n', settings)).toBe(true);
    expect(isEntranceQr('OTHER', settings)).toBe(false);
    expect(isEntranceQr('', { entranceQr: '' })).toBe(false);
  });
});

describe('位置チェック', () => {
  const dojo = { dojoLatitude: 35.5, dojoLongitude: 133.0, allowedDistanceMeters: 150 };
  /** 道場から北へ `meters` メートル */
  const north = (meters: number, accuracyMeters = 0) => ({
    latitude: 35.5 + meters / 111_195,
    longitude: 133.0,
    accuracyMeters,
  });

  it('道場の位置が未設定なら確かめない', () => {
    const settings = { ...dojo, dojoLatitude: null };

    expect(checkLocation(settings, null)).toEqual({ ok: true, distanceMeters: null });
  });

  it('位置が取れなければ拒否する', () => {
    expect(checkLocation(dojo, null).ok).toBe(false);
  });

  it('距離から GPS の誤差を引いて比べる', () => {
    expect(checkLocation(dojo, north(150))).toEqual({ ok: true, distanceMeters: 150 });
    expect(checkLocation(dojo, north(180)).ok).toBe(false);
    expect(checkLocation(dojo, north(180, 40)).ok).toBe(true);
  });

  it('差し引く誤差は200mまで', () => {
    expect(checkLocation(dojo, north(400, 1000)).ok).toBe(false);
    expect(checkLocation(dojo, north(340, 1000)).ok).toBe(true);
  });
});

describe('入室と退室（受け入れテスト22）', () => {
  const decide = (time: string, punches = [aPunch(MONDAY, '16:00:00')]) =>
    decideScan({ punches, now: at(time), duplicateScanSeconds: 120 });

  it('22: 120秒以内の2回目は無視する', () => {
    expect(decide('16:01:59').action).toBe('ignore');
  });

  it('120秒たてば退室', () => {
    expect(decide('16:02:00')).toEqual({ action: 'record', kind: 'out', firstInToday: false });
  });

  it('打刻がなければ今日最初の入室', () => {
    expect(decide('16:00:00', [])).toEqual({ action: 'record', kind: 'in', firstInToday: true });
  });

  it('退室のあとの入室は最初の入室ではない', () => {
    const punches = [aPunch(MONDAY, '16:00:00'), aPunch(MONDAY, '16:30:00', 'out')];

    expect(decide('17:30:00', punches)).toMatchObject({ kind: 'in', firstInToday: false });
  });

  it('取り消した打刻と前の日の打刻は数えない', () => {
    const punches = [
      aPunch(MONDAY, '16:00:00', 'in', { canceledAt: at('16:00:10') }),
      aPunch('2026-11-28', '09:00:00'),
    ];

    expect(decide('16:00:30', punches)).toMatchObject({ kind: 'in', firstInToday: true });
  });
});

describe('最初の入室の結果', () => {
  const describeEntry = (time: string, retired = false) =>
    describeFirstEntry({
      member: aMember(retired ? { status: 'retired' } : {}),
      date: MONDAY,
      plan: resolvePracticePlan({
        date: MONDAY,
        memberId: 'm1',
        rules: RULES,
        koma: NO_KOMA,
        exceptions: [],
      }),
      enteredAt: at(time),
    });

  it('時間内と遅刻を区分と基準つきで返す', () => {
    expect(describeEntry('16:50:00')?.message).toBe('時間内（前半・17:00基準）');
    expect(describeEntry('17:02:30')).toEqual({
      message: '遅刻 3分（前半・17:00基準）',
      lateMinutes: 3,
      missed: false,
    });
  });

  it('練習の終了後の入室は、欠席の扱いと伝える', () => {
    const plan = resolvePracticePlan({
      date: MONDAY,
      memberId: 'm1',
      rules: RULES.map((rule) => ({ ...rule, endTime: '19:30' })),
      koma: NO_KOMA,
      exceptions: [],
    });
    const result = describeFirstEntry({
      member: aMember(),
      date: MONDAY,
      plan,
      enteredAt: at('19:31:00'),
    });

    expect(result).toEqual({
      message: '練習の終了後の入室（前半・19:30終了のため欠席の扱い）',
      lateMinutes: 0,
      missed: true,
    });
  });

  it('引退した人が登録なしで来たら判定しないと伝える', () => {
    expect(describeEntry('18:00:00', true)?.message).toContain('参加登録なし');
  });
});

describe('取り消し（受け入れテスト23）', () => {
  const punch = aPunch(MONDAY, '17:05:00');
  const refusal = (time: string, memberId = 'm1') =>
    undoRefusal({ punch, memberId, now: at(time), undoSeconds: 60 });

  it('60秒以内なら取り消せる', () => {
    expect(refusal('17:06:00')).toBeNull();
    expect(refusal('17:06:01')).toContain('取り消せる時間を過ぎました');
  });

  it('他人の記録と取り消し済みは拒否する', () => {
    expect(refusal('17:05:10', 'other')).toBe('自分の記録ではありません');
    expect(
      undoRefusal({
        punch: { ...punch, canceledAt: at('17:05:05') },
        memberId: 'm1',
        now: at('17:05:10'),
        undoSeconds: 60,
      }),
    ).toBe('すでに取り消されています');
  });

  it('23: 遅刻の入室を取り消すと、遅刻の罰が外れる', () => {
    const now = at('17:05:30');
    const canceled = { ...punch, canceledAt: now };
    const record = judgeAttendance({
      date: MONDAY,
      now,
      member: aMember(),
      rules: RULES,
      koma: NO_KOMA,
      exceptions: [],
      punches: [canceled],
      settings: DEFAULT_SETTINGS,
    });
    const changes = planAutoPenaltySync({
      date: MONDAY,
      judged: [{ memberId: 'm1', result: record?.result ?? null }],
      existing: [
        {
          id: 'p1',
          autoKey: autoPenaltyKey(MONDAY, 'm1'),
          reason: '遅刻',
          baseCount: 1,
          locked: false,
        },
      ],
      types: DEFAULT_PENALTY_TYPES,
    });

    expect(record?.result).toBe('not_arrived');
    expect(changes.remove).toEqual(['p1']);
  });
});

describe('在室と自動退室（受け入れテスト24）', () => {
  const punches = [
    aPunch(MONDAY, '18:00:00', 'in', { memberId: 'b' }),
    aPunch(MONDAY, '17:00:00', 'in', { memberId: 'a' }),
    aPunch(MONDAY, '16:00:00', 'in', { memberId: 'left' }),
    aPunch(MONDAY, '19:00:00', 'out', { memberId: 'left' }),
    aPunch(MONDAY, '22:05:00', 'in', { memberId: 'night' }),
  ];

  it('最後の打刻が入室の人を、早い順に返す', () => {
    expect(presentMembers(punches).map((present) => present.memberId)).toEqual(['a', 'b', 'night']);
  });

  it('24: 在室中の人は22:00に自動退室。後から入った人は入室の時刻', () => {
    const checkouts = planAutoCheckout({ date: MONDAY, punches, autoCheckoutTime: '22:00' });

    expect(checkouts).toEqual([
      { memberId: 'a', at: toInstant(MONDAY, '22:00') },
      { memberId: 'b', at: toInstant(MONDAY, '22:00') },
      { memberId: 'night', at: toInstant(MONDAY, '22:05') },
    ]);
  });

  it('ほかの日の入室は自動退室にしない', () => {
    expect(planAutoCheckout({ date: TUESDAY, punches, autoCheckoutTime: '22:00' })).toEqual([]);
  });
});
