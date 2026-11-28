// 管理者（部員ではない、開発用のログイン）
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runAction } from '../functions/_shared/router.ts';
import { anonymousClient, clearRecords, connect, insertMember, signInDevice } from './helpers.ts';

const sql = connect();
const containing = (text: string): unknown => expect.stringContaining(text);
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

describe('管理者に指定した部員', () => {
  async function memberDevice(values: { role?: 'captain' | 'vice'; is_admin?: boolean }) {
    const device = await signInDevice();
    const { id } = await insertMember(sql, { ...values, auth_user_id: device.userId });
    return { ...device, id };
  }
  const manager = () => memberDevice({ is_admin: true });
  const captain = () => memberDevice({ role: 'captain' });

  const stored = async (id: string) => {
    const [row] = await sql<{ role: string; isAdmin: boolean }[]>`
      select role, is_admin as "isAdmin" from public.members where id = ${id}`;
    return row;
  };

  const change = (userId: string, memberId: string, changes: object) =>
    run('admin-update-member', { memberId, changes }, userId);

  it('主将と同じ操作ができ、記録した人はその部員になる', async () => {
    const admin = await manager();
    const { id } = await insertMember(sql, { approved: false });

    expect((await run('admin-approve', { memberId: id }, admin.userId)).ok).toBe(true);
    await run('admin-add-exception', { date: DATE, kind: 'day_off' }, admin.userId);

    expect(await sql`select created_by from public.exceptions`).toEqual([{ created_by: admin.id }]);
  });

  it('名簿と設定を読める', async () => {
    const admin = await manager();
    await insertMember(sql);

    const members = await admin.client.from('members').select('id');
    const qr = await admin.client.from('settings').select('key').eq('key', 'entranceQr');

    expect(members.data).toHaveLength(2);
    expect(qr.data).toHaveLength(1);
  });

  it('役職と重ねられ、役職の権限はそのまま使える', async () => {
    const admin = await manager();
    const vice = await memberDevice({ role: 'vice' });

    expect(await change(admin.userId, vice.id, { isAdmin: true })).toMatchObject({ ok: true });

    expect(await stored(vice.id)).toEqual({ role: 'vice', isAdmin: true });
    expect((await run('admin-rejudge', { date: DATE }, vice.userId)).ok).toBe(true);
    const home: unknown = (await vice.client.rpc('home')).data;
    expect(home).toMatchObject({ member: { role: 'vice', isAdmin: true }, pendingMembers: 0 });
  });

  it.each([
    ['admin-update-member', { changes: { isAdmin: false } }],
    ['admin-update-member', { changes: { status: 'graduated' } }],
    ['admin-reset-device', {}],
    ['admin-delete-member', { deleteRecords: true }],
    ['admin-approve', {}],
  ])('主将は %s で管理者を変えられない: %o', async (action, params) => {
    const chief = await captain();
    const admin = await manager();

    const result = await run(action, { memberId: admin.id, ...params }, chief.userId);

    expect(result).toMatchObject({ ok: false, error: containing('管理者だけ') });
    expect(await stored(admin.id)).toEqual({ role: 'member', isAdmin: true });
  });

  it('主将は自分に管理者を付けられないが、指定を変えずに名簿は保存できる', async () => {
    const chief = await captain();

    expect((await change(chief.userId, chief.id, { isAdmin: true })).ok).toBe(false);
    expect((await change(chief.userId, chief.id, { isAdmin: false, grade: 'B3' })).ok).toBe(true);
    expect(await stored(chief.id)).toEqual({ role: 'captain', isAdmin: false });
  });

  it('管理者がいれば、主将を外せる', async () => {
    const admin = await manager();
    const chief = await captain();

    expect((await change(admin.userId, chief.id, { role: 'member' })).ok).toBe(true);
  });

  it('最後の管理できる人は、自分の管理者を外せない', async () => {
    const admin = await manager();

    expect((await change(admin.userId, admin.id, { isAdmin: false })).ok).toBe(false);
    expect(await stored(admin.id)).toEqual({ role: 'member', isAdmin: true });
  });

  it('管理者ログインは、主将に管理者を足せる', async () => {
    const chief = await captain();

    expect((await change(admin.userId, chief.id, { isAdmin: true })).ok).toBe(true);
    expect(await stored(chief.id)).toEqual({ role: 'captain', isAdmin: true });
  });
});

describe('男子副将・女子副将・主務・会計', () => {
  const roles = ['men_vice_captain', 'women_vice_captain', 'chief_manager', 'treasurer'] as const;

  it.each(roles)('%s を指定でき、権限は部員と同じ', async (role) => {
    const device = await signInDevice();
    const { id } = await insertMember(sql, { auth_user_id: device.userId });
    await insertMember(sql);

    expect(await run('admin-update-member', { memberId: id, changes: { role } })).toMatchObject({
      ok: true,
    });
    const { data } = await device.client.from('members').select('id');
    expect(data).toEqual([{ id }]);
    expect(await run('admin-rejudge', { date: DATE }, device.userId)).toMatchObject({ ok: false });
  });
});
