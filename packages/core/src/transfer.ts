// 登録済みの画面で出した番号を使って、別の端末やブラウザに部員登録を引き継ぐ
import { normalizeStudentNo } from './registration.ts';
import { invalid, type Validated } from './validation.ts';

export const TRANSFER_CODE_DIGITS = 6;
export const TRANSFER_TTL_MINUTES = 10;
/** この回数まちがえたら、番号を使えなくする */
export const TRANSFER_MAX_ATTEMPTS = 5;

/** 学生番号が違う場合も同じ文にして、登録の有無を知らせない */
export const TRANSFER_FAILED_MESSAGE =
  '番号が違うか、使えなくなっています。登録済みの画面で番号を出し直してください。';

/** 全角の数字と、区切りの空白やハイフンを受け付ける */
export function normalizeTransferCode(value: string): string {
  return value.normalize('NFKC').replace(/[\s-]/g, '');
}

export function transferExpiry(now: Date): Date {
  return new Date(now.getTime() + TRANSFER_TTL_MINUTES * 60_000);
}

export function validateTransferClaim(input: {
  studentNo: string;
  code: string;
}): Validated<{ studentNo: string; code: string }> {
  const studentNo = normalizeStudentNo(input.studentNo.normalize('NFKC'));
  const code = normalizeTransferCode(input.code);
  if (!studentNo) return invalid('学生番号を入力してください。');
  if (!new RegExp(`^\\d{${TRANSFER_CODE_DIGITS}}$`).test(code)) {
    return invalid(`引き継ぎ番号は${TRANSFER_CODE_DIGITS}桁の数字です。`);
  }
  return { ok: true, value: { studentNo, code } };
}

/**
 * 入力された番号の扱い。`accept` は引き継ぐ。`retry` はまちがいを数える。
 * `discard` は番号を消す（期限切れ、まちがいが上限）。
 */
export function judgeTransfer(input: {
  expiresAt: Date;
  /** これまでにまちがえた回数 */
  attempts: number;
  matches: boolean;
  now: Date;
}): 'accept' | 'retry' | 'discard' {
  const { expiresAt, attempts, matches, now } = input;
  if (now >= expiresAt || attempts >= TRANSFER_MAX_ATTEMPTS) return 'discard';
  if (matches) return 'accept';
  return attempts + 1 >= TRANSFER_MAX_ATTEMPTS ? 'discard' : 'retry';
}
