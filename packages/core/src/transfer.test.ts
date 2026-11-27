import { describe, expect, it } from 'vitest';
import { judgeTransfer, transferExpiry, validateTransferClaim } from './transfer.ts';

const now = new Date('2026-11-30T03:00:00Z');
const judge = (overrides: Partial<Parameters<typeof judgeTransfer>[0]> = {}) =>
  judgeTransfer({ expiresAt: transferExpiry(now), attempts: 0, matches: true, now, ...overrides });

describe('引き継ぎ番号', () => {
  it('10分間だけ使える', () => {
    expect(judge({ now: new Date(now.getTime() + 10 * 60_000 - 1) })).toBe('accept');
    expect(judge({ now: new Date(now.getTime() + 10 * 60_000) })).toBe('discard');
  });

  it('5回まちがえたら使えなくする', () => {
    expect(judge({ matches: false, attempts: 3 })).toBe('retry');
    expect(judge({ matches: false, attempts: 4 })).toBe('discard');
    expect(judge({ attempts: 5 })).toBe('discard');
  });

  it('全角の数字や区切りを受け付ける', () => {
    expect(validateTransferClaim({ studentNo: ' ｓ0001 ', code: '１２３ 456' })).toEqual({
      ok: true,
      value: { studentNo: 'S0001', code: '123456' },
    });
  });

  it('桁数が違う番号と、空の学生番号は受け付けない', () => {
    expect(validateTransferClaim({ studentNo: 'S0001', code: '12345' }).ok).toBe(false);
    expect(validateTransferClaim({ studentNo: 'S0001', code: 'abcdef' }).ok).toBe(false);
    expect(validateTransferClaim({ studentNo: '', code: '123456' }).ok).toBe(false);
  });
});
