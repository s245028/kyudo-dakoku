import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, clearRecords, connect, insertMember, signInDevice } from './helpers.ts';
import type { Device } from './helpers.ts';

const sql = connect();
let member: Device;
let pending: Device;
let stranger: Device;
const ids = { member: '', pending: '', left: '', canceled: '' };

beforeAll(async () => {
  await clearRecords(sql);
  [member, pending, stranger] = await Promise.all([signInDevice(), signInDevice(), signInDevice()]);
  ids.member = (await insertMember(sql, { auth_user_id: member.userId, name: '在室' })).id;
  ids.pending = (await insertMember(sql, { auth_user_id: pending.userId, approved: false })).id;
  ids.left = (await insertMember(sql)).id;
  ids.canceled = (await insertMember(sql)).id;

  const punch = (memberId: string, minutesAgo: number, kind: string, canceled = false) => sql`
    insert into public.punches (member_id, punched_at, kind, via, canceled_at)
    values (${memberId},
      greatest(now() - ${minutesAgo} * interval '1 minute',
        date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'),
      ${kind}, 'app', ${canceled ? new Date() : null})`;
  await punch(ids.member, 2, 'in');
  await punch(ids.left, 2, 'in');
  await punch(ids.left, 1, 'out');
  await punch(ids.canceled, 1, 'in', true);

  const [open] = await sql<{ id: string }[]>`
    insert into public.penalties (practice_date, member_id, reason, base_count)
    values ('2026-11-02', ${ids.member}, '遅刻', 1) returning id`;
  await sql`insert into public.penalty_tasks (penalty_id, content, done_at)
    values (${open!.id}, '掃除', '2026-11-03T23:30:00Z')`;
  await sql`insert into public.penalties
    (practice_date, member_id, reason, base_count, completed_on)
    values ('2026-11-01', ${ids.left}, '遅刻', 1, '2026-11-02')`;
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

const call = async (device: Device, name: string) => {
  const response = await device.client.rpc(name);
  if (response.error) throw new Error(response.error.message);
  return response.data as unknown;
};

describe('home', () => {
  it('自分の登録内容と罰を返す', async () => {
    const home = await call(member, 'home');

    expect(home).toMatchObject({
      member: { id: ids.member, name: '在室' },
      settings: { noticeLeadMinutes: 60, requiresLocation: false },
      punches: [{ kind: 'in' }],
      penalties: [{ reason: '遅刻', tasks: [{ content: '掃除', completedOn: '2026-11-04' }] }],
    });
    expect((home as { rules: unknown[] }).rules).toHaveLength(10);
    expect(JSON.stringify(home)).not.toContain('LOCAL-TEST-QR');
  });

  it('承認待ちには罰を返さない', async () => {
    expect(await call(pending, 'home')).toMatchObject({
      member: { approved: false },
      penalties: [],
    });
  });

  it('未登録なら member が null', async () => {
    expect(await call(stranger, 'home')).toEqual({ member: null });
  });
});

describe('presence と penalty_board', () => {
  it('最後の打刻が入室の人だけを返す', async () => {
    expect(await call(member, 'presence')).toMatchObject([{ member_id: ids.member, name: '在室' }]);
  });

  it('未消化の罰だけを返す', async () => {
    expect(await call(member, 'penalty_board')).toMatchObject([{ name: '在室' }]);
  });

  it.each(['presence', 'penalty_board'])('承認していない端末には %s は空', async (name) => {
    expect(await call(pending, name)).toEqual([]);
    expect(await call(stranger, name)).toEqual([]);
  });

  it.each(['home', 'presence', 'penalty_board'])('ログインなしでは %s を呼べない', async (name) => {
    const { error } = await anonymousClient().rpc(name);

    expect(error?.message).toContain('permission denied');
  });
});
