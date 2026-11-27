import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymousClient,
  clearRecords,
  connect,
  insertMember,
  signInDevice,
  type Device,
} from './helpers.ts';

const sql = connect();

type Who = 'member' | 'other' | 'pending' | 'suspended' | 'vice' | 'captain' | 'stranger';
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Exclude<Who, 'stranger'>, string>;

const DATE = '2026-11-30';
const OWNED_TABLES = ['koma', 'punches', 'attendance', 'exceptions'] as const;

beforeAll(async () => {
  await clearRecords(sql);
  const people = {
    member: {},
    other: {},
    pending: { approved: false },
    suspended: { status: 'suspended' as const },
    vice: { role: 'vice' as const },
    captain: { role: 'captain' as const },
  };
  for (const [who, attributes] of Object.entries(people)) {
    const key = who as keyof typeof people;
    devices[key] = await signInDevice();
    const { id } = await insertMember(sql, { ...attributes, auth_user_id: devices[key].userId });
    ids[key] = id;
    await sql`insert into public.koma (member_id, mon4) values (${id}, true)`;
    await sql`insert into public.punches (member_id, punched_at, kind, via)
      values (${id}, ${`${DATE}T17:00:00+09:00`}, 'in', 'app')`;
    await sql`insert into public.attendance (practice_date, member_id, part, deadline, auto_result)
      values (${DATE}, ${id}, 'first', '17:00', 'present')`;
    await sql`insert into public.exceptions (date, member_id, kind)
      values (${DATE}, ${id}, 'late_notice')`;
  }
  devices.stranger = await signInDevice();
  const [penalty] = await sql<{ id: string }[]>`
    insert into public.penalties (practice_date, member_id, reason, base_count)
    values (${DATE}, ${ids.other}, '遅刻', 1) returning id`;
  await sql`insert into public.penalty_tasks (penalty_id, content)
    values (${penalty!.id}, '道場の掃除')`;
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

async function readAll(who: Who, table: string, columns = '*') {
  const { data, error } = await devices[who].client.from(table).select(columns);
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, unknown>[];
}

describe('本人と主将・副務だけが読める表', () => {
  it.each(OWNED_TABLES)('部員は %s の自分の行だけを読める', async (table) => {
    const rows = await readAll('member', table);

    expect(rows.map((row) => row['member_id'])).toEqual([ids.member]);
  });

  it.each(OWNED_TABLES)('主将と副務は %s の全員の行を読める', async (table) => {
    expect(await readAll('captain', table)).toHaveLength(6);
    expect(await readAll('vice', table)).toHaveLength(6);
  });

  it('全員向けの臨時変更は登録した部員が読める', async () => {
    await sql`insert into public.exceptions (date, kind) values (${DATE}, 'day_off')`;

    expect(await readAll('pending', 'exceptions')).toHaveLength(2);
    expect(await readAll('stranger', 'exceptions')).toHaveLength(0);
  });
});

describe('部員名簿', () => {
  it('部員は自分の行だけ、主将と副務は全員を読める', async () => {
    expect(await readAll('member', 'members', 'id')).toEqual([{ id: ids.member }]);
    expect(await readAll('vice', 'members', 'id')).toHaveLength(6);
  });

  it('端末の識別子は主将も読めない', async () => {
    const { error } = await devices.captain.client.from('members').select('auth_user_id');

    expect(error?.message).toContain('permission denied');
  });

  it('端末が結びついているかは分かる', async () => {
    expect(await readAll('member', 'members', 'linked')).toEqual([{ linked: true }]);
  });
});

describe('罰とやること', () => {
  it.each(['penalties', 'penalty_tasks', 'penalty_types'])(
    '承認済みの部員は全員の %s を読める',
    async (table) => {
      expect((await readAll('member', table)).length).toBeGreaterThan(0);
    },
  );

  it.each(['pending', 'suspended', 'stranger'] as const)('%s は読めない', async (who) => {
    expect(await readAll(who, 'penalties')).toEqual([]);
    expect(await readAll(who, 'penalty_tasks')).toEqual([]);
  });
});

describe('設定', () => {
  const keys = async (who: Who) => (await readAll(who, 'settings')).map((row) => row['key']);

  it('入口QRは主将だけが読める', async () => {
    expect(await keys('captain')).toContain('entranceQr');
    for (const who of ['member', 'vice', 'pending'] as const) {
      expect(await keys(who)).not.toContain('entranceQr');
      expect(await keys(who)).toContain('komaLocked');
    }
  });

  it('登録していない端末は何も読めない', async () => {
    expect(await keys('stranger')).toEqual([]);
    expect(await readAll('stranger', 'practice_rules')).toEqual([]);
    expect(await readAll('stranger', 'members', 'id')).toEqual([]);
  });

  it('ログインしていなければ表に触れない', async () => {
    for (const table of ['settings', 'penalties', 'koma']) {
      const { error } = await anonymousClient().from(table).select('*');
      expect(error?.message).toContain('permission denied');
    }
  });
});

describe('アプリから表を直接書き換えられない', () => {
  const targets: Record<string, Record<string, unknown>> = {
    settings: { key: 'komaLocked', value: true },
    practice_rules: { weekday: 3, condition: 'all', part: 'whole', deadline: '09:00' },
    members: { approved: true },
    koma: { mon4: false },
    exceptions: { memo: 'x' },
    punches: { canceled_at: new Date().toISOString() },
    attendance: { manual_result: 'present' },
    penalty_types: { base_count: 2 },
    penalties: { completed_on: DATE },
    penalty_tasks: { content: 'x' },
    grade_promotions: { fiscal_year: 2026 },
    admins: { auth_user_id: '00000000-0000-0000-0000-000000000000' },
  };

  it.each(Object.entries(targets))('%s は主将でも書き換えられない', async (table, values) => {
    const { client } = devices.captain;
    const column = Object.keys(values)[0]!;
    const results = await Promise.all([
      client.from(table).insert(values),
      client.from(table).update(values).not(column, 'is', null),
      client.from(table).delete().not(column, 'is', null),
    ]);

    for (const { error } of results) expect(error?.code).toBe('42501');
  });
});
