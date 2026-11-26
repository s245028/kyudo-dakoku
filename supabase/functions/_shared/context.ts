import { isEnrolled, STATUS_LABELS } from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';
import { AppError } from './errors.ts';
import { lockMemberByDevice, type MemberRow } from './store.ts';

/** 1回の操作で使うもの。`userId` はログインを確かめた端末の識別子 */
export type RequestContext = { sql: Sql; userId: string; now: Date };

export const UNREGISTERED_MESSAGE = 'この端末は登録されていません。登録し直してください。';

/** この端末の、在籍中の部員をロックして返す。承認が必要な操作は呼び出し側で確かめる。 */
export async function requireEnrolledMember(tx: Sql, userId: string): Promise<MemberRow> {
  const member = await lockMemberByDevice(tx, userId);
  if (!member) throw new AppError(UNREGISTERED_MESSAGE);
  if (!isEnrolled(member.status)) {
    throw new AppError(
      `${STATUS_LABELS[member.status]}のため打刻できません。主将に確認してください。`,
    );
  }
  return member;
}
