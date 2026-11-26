import { describe, expect, it } from 'vitest';
import {
  validateException,
  validateManualJudgement,
  validateMemberUpdate,
  validatePenaltyType,
  validatePracticeRule,
  validateSettings,
} from './admin-input.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { MONDAY, RULES } from './testing.ts';

describe('名簿の変更', () => {
  const active = { status: 'active' as const, retiredOn: null };
  const retired = { status: 'retired' as const, retiredOn: '2026-10-01' };

  it('指定した項目だけを返す', () => {
    expect(validateMemberUpdate({ role: 'vice' }, retired, MONDAY)).toEqual({
      ok: true,
      value: { role: 'vice', retiredOn: '2026-10-01' },
    });
  });

  it('引退にすると引退日は今日。指定すればその日', () => {
    expect(validateMemberUpdate({ status: 'retired' }, active, MONDAY)).toMatchObject({
      value: { retiredOn: MONDAY },
    });
    expect(
      validateMemberUpdate({ status: 'retired', retiredOn: '2026-11-01' }, active, MONDAY),
    ).toMatchObject({ value: { retiredOn: '2026-11-01' } });
  });

  it('現役に戻すと引退日を消す', () => {
    expect(validateMemberUpdate({ status: 'active' }, retired, MONDAY)).toMatchObject({
      value: { retiredOn: null },
    });
  });

  it.each([{ name: ' ' }, { grade: 'x' }, { role: 'x' }, { status: 'x' }, { retiredOn: 'x' }])(
    '%o は拒否する',
    (input) => {
      expect(validateMemberUpdate(input, active, MONDAY).ok).toBe(false);
    },
  );
});

describe('臨時変更', () => {
  const input = { date: MONDAY, kind: 'late_notice', memberId: 'm1' };

  it('連絡日時は連絡にだけ記録する', () => {
    const contactedAt = '2026-11-30T15:40:00+09:00';

    expect(validateException({ ...input, contactedAt })).toMatchObject({
      value: { contactedAt: new Date(contactedAt) },
    });
    expect(validateException({ ...input, kind: 'koma4', contactedAt })).toMatchObject({
      value: { contactedAt: null },
    });
  });

  it('全員にできるのは休みとコマの変更だけ', () => {
    expect(validateException({ date: MONDAY, kind: 'day_off' }).ok).toBe(true);
    expect(validateException({ date: MONDAY, kind: 'join' }).ok).toBe(false);
  });

  it.each([{ date: 'x' }, { kind: 'x' }, { contactedAt: 'x' }])('%o は拒否する', (change) => {
    expect(validateException({ ...input, ...change }).ok).toBe(false);
  });
});

describe('手動判定', () => {
  it('上書きには修正理由が必要', () => {
    expect(validateManualJudgement({ judgement: 'present', reason: '' }).ok).toBe(false);
    expect(validateManualJudgement({ judgement: 'present', reason: '打刻忘れ' }).ok).toBe(true);
  });

  it('空にすると自動判定に戻る', () => {
    expect(validateManualJudgement({ judgement: '' })).toEqual({
      ok: true,
      value: { judgement: null, reason: '' },
    });
  });

  it('未到着は手動で選べない', () => {
    expect(validateManualJudgement({ judgement: 'not_arrived', reason: 'x' }).ok).toBe(false);
  });
});

describe('設定', () => {
  const settings = { ...DEFAULT_SETTINGS };

  it('入口QRは含めない', () => {
    const result = validateSettings({ ...settings, entranceQr: 'changed' });

    expect(result.ok && 'entranceQr' in result.value).toBe(false);
  });

  it.each([
    { penaltyDoublingDays: 0 },
    { undoSeconds: 1.5 },
    { allowedDistanceMeters: '150' },
    { dojoLatitude: 35 },
    { dojoLatitude: 91, dojoLongitude: 0 },
    { autoCheckoutTime: '25:00' },
  ])('%o は拒否する', (change) => {
    expect(validateSettings({ ...settings, ...change }).ok).toBe(false);
  });
});

describe('練習ルールと罰の種類', () => {
  it('正しいルールを受け付ける', () => {
    expect(validatePracticeRule(RULES[0]!)).toEqual({ ok: true, value: RULES[0] });
    expect(validatePracticeRule({ ...RULES[0], deadline: '' }).ok).toBe(false);
    expect(validatePracticeRule({ ...RULES[0], weekday: 7 }).ok).toBe(false);
  });

  it('基本の数は1以上', () => {
    expect(validatePenaltyType({ reason: '遅刻', baseCount: 2 }).ok).toBe(true);
    expect(validatePenaltyType({ reason: '遅刻', baseCount: 0 }).ok).toBe(false);
    expect(validatePenaltyType({ reason: ' ', baseCount: 1 }).ok).toBe(false);
  });
});
