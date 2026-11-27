import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { inject } from 'vitest';
import type { Grade, MemberStatus, Role } from '../../packages/core/src/index.ts';

export function connect() {
  return postgres(inject('stack').dbUrl, { max: 4, onnotice: () => {} });
}
export type Sql = ReturnType<typeof connect>;

/** 部員とその記録を消して、初期値は残す。 */
export async function clearRecords(sql: Sql) {
  await sql`truncate public.members, public.exceptions, public.punches, public.attendance,
    public.penalties, public.penalty_tasks, public.grade_promotions, public.nightly_runs,
    public.admins, public.lineups restart identity cascade`;
}

export function anonymousClient() {
  const { apiUrl, publishableKey } = inject('stack');
  return createClient(apiUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Device = {
  client: ReturnType<typeof anonymousClient>;
  userId: string;
  accessToken: string;
};

/** 匿名ログインした端末を作る。 */
export async function signInDevice(): Promise<Device> {
  const client = anonymousClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || !data.session) throw error ?? new Error('匿名ログインに失敗しました');
  return { client, userId: data.user.id, accessToken: data.session.access_token };
}

let sequence = 0;

export async function insertMember(
  sql: Sql,
  overrides: Partial<{
    name: string;
    grade: Grade;
    status: MemberStatus;
    role: Role;
    approved: boolean;
    retired_on: string | null;
    auth_user_id: string | null;
  }> = {},
): Promise<{ id: string; studentNo: string }> {
  sequence += 1;
  const studentNo = `T${String(sequence).padStart(5, '0')}`;
  const values = {
    student_no: studentNo,
    name: `部員${sequence}`,
    grade: 'B2',
    gender: 'male',
    approved: true,
    ...overrides,
  };
  const [row] = await sql<{ id: string }[]>`insert into public.members ${sql(values)} returning id`;
  return { id: row!.id, studentNo };
}
