// 引き継ぎ番号の発行（登録済みの端末）と、番号を使った引き継ぎ（未登録の端末）
import {
  judgeTransfer,
  toPracticeDate,
  TRANSFER_CODE_DIGITS,
  TRANSFER_FAILED_MESSAGE,
  transferExpiry,
  validateTransferClaim,
} from '../../../../packages/core/src/index.ts';
import { isAdmin, UNREGISTERED_MESSAGE, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { stringParam, type Params } from '../params.ts';
import { homeSnapshot, lockMemberByDevice } from '../store.ts';

function randomCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(value! % 10 ** TRANSFER_CODE_DIGITS).padStart(TRANSFER_CODE_DIGITS, '0');
}

async function hashCode(memberId: string, code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${memberId}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 自分の登録を引き継ぐ番号を出す。出し直すと、前の番号は使えなくなる。 */
export async function createTransferCode({ sql, userId, now }: RequestContext) {
  const code = randomCode();
  const expiresAt = transferExpiry(now);

  await inTransaction(sql, async (tx) => {
    const member = await lockMemberByDevice(tx, userId);
    if (!member) throw new AppError(UNREGISTERED_MESSAGE);
    const row = {
      member_id: member.id,
      code_hash: await hashCode(member.id, code),
      expires_at: expiresAt,
      attempts: 0,
    };
    await tx`insert into public.device_transfers ${tx(row)}
      on conflict (member_id) do update set
        code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`;
  });
  return { code, expiresAt: expiresAt.toISOString() };
}

/** 学生番号と引き継ぎ番号が合えば、その部員をこの端末に移す。承認はそのまま。 */
export async function claimTransfer({ sql, userId, now }: RequestContext, params: Params) {
  const input = validateTransferClaim({
    studentNo: stringParam(params, 'studentNo'),
    code: stringParam(params, 'code'),
  });
  if (!input.ok) throw new AppError(input.message);
  const { studentNo, code } = input.value;

  // まちがいの回数を残すため、失敗はトランザクションを終えてから伝える
  const moved = await inTransaction(sql, async (tx) => {
    if (await isAdmin(tx, userId)) {
      throw new AppError('管理者のログイン中は引き継げません。');
    }
    if (await lockMemberByDevice(tx, userId)) {
      throw new AppError('この端末はすでに登録されています。画面を開き直してください。');
    }
    const [member] = await tx<{ id: string }[]>`
      select id from public.members where student_no = ${studentNo} for update`;
    if (!member) return false;
    const [record] = await tx<{ codeHash: string; expiresAt: Date; attempts: number }[]>`
      select code_hash as "codeHash", expires_at as "expiresAt", attempts
      from public.device_transfers where member_id = ${member.id}`;
    if (!record) return false;

    const result = judgeTransfer({
      ...record,
      matches: record.codeHash === (await hashCode(member.id, code)),
      now,
    });
    if (result === 'retry') {
      await tx`update public.device_transfers set attempts = attempts + 1
        where member_id = ${member.id}`;
      return false;
    }
    await tx`delete from public.device_transfers where member_id = ${member.id}`;
    if (result === 'discard') return false;
    await tx`update public.members set auth_user_id = ${userId} where id = ${member.id}`;
    return true;
  });
  if (!moved) throw new AppError(TRANSFER_FAILED_MESSAGE);
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}
