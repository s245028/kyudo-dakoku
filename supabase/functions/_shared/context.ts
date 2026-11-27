import {
  canAdminister,
  canEditLineups,
  canManagePenalties,
  isEnrolled,
  STATUS_LABELS,
} from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';
import { AppError } from './errors.ts';
import type { PushSender } from './push.ts';
import { findMemberByDevice, lockMemberByDevice, type MemberRow } from './store.ts';

/** 1回の操作で使うもの。`userId` はログインを確かめた端末の識別子 */
export type RequestContext = {
  sql: Sql;
  userId: string;
  now: Date;
  /** 通知の送り方。テストで差し替える */
  sendPush?: PushSender;
};

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

/**
 * 管理の操作をする人。`id` は部員の id で、管理者ログイン（部員ではない）は null。
 * 記録した人の列には、この `id` をそのまま入れる。
 * `isAdmin` は、管理者ログインか、役職が管理者の部員。
 */
export type Actor = { id: string | null; isAdmin: boolean };

export async function isAdmin(tx: Sql, userId: string): Promise<boolean> {
  const [admin] = await tx`select 1 from public.admins where auth_user_id = ${userId}`;
  return admin !== undefined;
}

// 管理の操作は、自分の行をロックせずに確かめる。複数の部員をロックする操作は
// id の順にロックするので、先に自分の行をロックすると行き詰まることがある。
async function requireActor(
  tx: Sql,
  userId: string,
  allows: (member: MemberRow) => boolean,
  refusal: string,
): Promise<Actor> {
  if (await isAdmin(tx, userId)) return { id: null, isAdmin: true };
  const member = await findMemberByDevice(tx, userId);
  if (!member || !allows(member)) throw new AppError(refusal);
  return { id: member.id, isAdmin: member.role === 'admin' };
}

export const requireOfficer = (tx: Sql, userId: string) =>
  requireActor(tx, userId, canManagePenalties, 'この操作ができるのは、副務と管理者だけです。');

export const requireCaptain = (tx: Sql, userId: string) =>
  requireActor(tx, userId, canAdminister, 'この操作ができるのは、主将と管理者だけです。');

export const requireLineupEditor = (tx: Sql, userId: string) =>
  requireActor(
    tx,
    userId,
    canEditLineups,
    '立ち順を作れるのは、主将・男子副将・女子副将・主務・管理者だけです。',
  );
