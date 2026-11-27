// 管理者（部員ではない、開発用のログイン）
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runAction } from '../functions/_shared/router.ts';
import { anonymousClient, clearRecords, connect, insertMember, signInDevice } from './helpers.ts';

const sql = connect();
const DATE = '2026-11-30';
const NOW = toInstant(DATE, '12:00');

type Client = ReturnType<typeof anonymousClient>;
let admin: { client: Client; userId: string };
let sequence = 0;

/** メールアドレスとパスワードのアカウントを作り、管理者として登録する。 */
async function createAdmin() {
  const client = anonymousClient();
  sequence += 1;
  const { data, error } = await client.auth.signUp({
    email: `admin-${Date.now()}-${sequence}@example.test`,
    password: 'local-test-password',
  });
  if (error || !data.user) throw error ?? new Error('アカウントを作れませんでした');
  await sql`insert into public.admins (auth_user_id) values (${data.user.id})`;
  return { client, userId: data.user.id };
}

beforeEach(async () => {
  await clearRecords(sql);
  admin = await createAdmin();
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

const run = (action: string, params: object = {}, userId = admin.userId) =>
  runAction({ sql, userId, now: NOW }, action, params as Record<string, unknown>);

async function read(table: string, columns = '*') {
  const { data, error } = await admin.client.from(table).select(columns);
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, unknown>[];
}

describe('管理者が読めるもの', () => {
  it('home は部員の代わりに isAdmin を返す', async () => {
    const data: unknown = (await admin.client.rpc('home')).data;

    expect(data).toMatchObject({ member: null, isAdmin: true });
    expect(JSON.stringify(data)).not.toContain('LOCAL-TEST-QR');
  });

  it('名簿・設定・練習ルール・コマ表を読める', async () => {
    const { id } = await insertMember(sql);
    await sql`insert into public.koma (member_id) values (${id})`;

    expect(await read('members', 'id')).toHaveLength(1);
    expect(await read('koma')).toHaveLength(1);
    expect(await read('practice_rules')).toHaveLength(10);
    expect((await read('settings')).map((row) => row['key'])).toContain('entranceQr');
  });

  it('在室一覧を読める', async () => {
    const { id } = await insertMember(sql);
    await sql`insert into public.punches (member_id, punched_at, kind, via)
      values (${id}, now(), 'in', 'app')`;

    const data: unknown = (await admin.client.rpc('presence')).data;

    expect(data).toHaveLength(1);
  });

  it('管理者の表は、管理者もアプリから読み書きできない', async () => {
    const { error } = await admin.client.from('admins').select('*');

    expect(error?.code).toBe('42501');
  });

  it('登録を消すと、権限もなくなる', async () => {
    await insertMember(sql);
    await sql`delete from public.admins`;

    expect(await read('members', 'id')).toEqual([]);
    expect((await run('admin-rejudge', { date: DATE })).ok).toBe(false);
  });

  it('管理者でないメールアドレスのアカウントには権限がない', async () => {
    await insertMember(sql);
    const other = await createAdmin();
    await sql`delete from public.admins where auth_user_id = ${other.userId}`;

    const data: unknown = (await other.client.rpc('home')).data;

    expect(data).toEqual({ member: null });
    expect((await run('admin-rejudge', { date: DATE }, other.userId)).ok).toBe(false);
  });
});

describe('管理者の操作', () => {
  it('主将がまだいなくても、承認して主将を指定できる', async () => {
    const { id } = await insertMember(sql, { approved: false });

    expect((await run('admin-approve', { memberId: id })).ok).toBe(true);
    const promoted = await run('admin-update-member', {
      memberId: id,
      changes: { role: 'captain' },
    });

    expect(promoted.ok).toBe(true);
    expect(await sql`select role, approved from public.members`).toEqual([
      { role: 'captain', approved: true },
    ]);
  });

  it('唯一の主将の再登録を許可できる', async () => {
    const device = await signInDevice();
    const { id } = await insertMember(sql, { role: 'captain', auth_user_id: device.userId });

    expect((await run('admin-reset-device', { memberId: id })).ok).toBe(true);
  });

  it('罰の付与と消化ができ、記録した人は空になる', async () => {
    const { id } = await insertMember(sql);

    const added = await run('add-penalty', {
      memberId: id,
      reason: '私物の出しっぱなし',
      date: DATE,
      contents: ['掃除'],
    });
    const [task] = await sql<{ id: string }[]>`select id from public.penalty_tasks`;
    const completed = await run('complete-task', { taskId: task!.id });

    expect([added.ok, completed.ok]).toEqual([true, true]);
    expect(
      await sql`select created_by, completed_on is not null as done from public.penalties`,
    ).toEqual([{ created_by: null, done: true }]);
  });

  it('部員の操作（登録・打刻）はできない', async () => {
    const input = { studentNo: 'A00001', name: '管理 者', gender: 'male', grade: 'B1' };

    expect(await run('register', input)).toEqual({
      ok: false,
      error: '管理者のログイン中は部員登録できません。',
    });
    expect((await run('scan', { qr: 'LOCAL-TEST-QR' })).ok).toBe(false);
  });
});
