import {
  canAdminister,
  canManagePenalties,
  isEnrolled,
  STATUS_LABELS,
} from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';
import { AppError } from './errors.ts';
import { findMemberByDevice, lockMemberByDevice, type MemberRow } from './store.ts';

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

// 管理の操作は、自分の行をロックせずに確かめる。複数の部員をロックする操作は
// id の順にロックするので、先に自分の行をロックすると行き詰まることがある。

export async function requireOfficer(tx: Sql, userId: string): Promise<MemberRow> {
  const member = await findMemberByDevice(tx, userId);
  if (!member || !canManagePenalties(member)) {
    throw new AppError('この操作ができるのは副務と主将だけです。');
  }
  return member;
}

export async function requireCaptain(tx: Sql, userId: string): Promise<MemberRow> {
  const member = await findMemberByDevice(tx, userId);
  if (!member || !canAdminister(member)) {
    throw new AppError('この操作ができるのは主将だけです。');
  }
  return member;
}
