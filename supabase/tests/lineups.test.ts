import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant, toPracticeDate } from '../../packages/core/src/index.ts';
import { runNightly } from '../functions/_shared/nightly.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
/** 公開した立ち順を読む関数はデータベースの今日を使うので、実際の今日にする */
const TODAY = toPracticeDate(new Date());
const NOW = toInstant(TODAY, '12:00');

type Who = 'captain' | 'member' | 'other';
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Who, string>;

beforeEach(async () => {
  await clearRecords(sql);
  for (const who of ['captain', 'member', 'other'] as const) {
    devices[who] = await signInDevice();
    const created = await insertMember(sql, {
      name: who,
      role: who === 'captain' ? 'captain' : 'member',
      auth_user_id: devices[who].userId,
    });
    ids[who] = created.id;
  }
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

const run = (who: Who, action: string, params: object, now = NOW) =>
  runAction({ sql, userId: devices[who].userId, now }, action, params as Record<string, unknown>);

/** 今の保存の日時。画面が編集のもとにする値 */
const savedAt = async (part = 'first') => {
  const [row] = await sql<{ at: Date }[]>`
    select updated_at as at from public.lineups where part = ${part}`;
  return row?.at.toISOString() ?? null;
};

const save = async (
  published: boolean,
  groups: string[][] = [[ids.other, ids.member]],
  who: Who = 'captain',
) =>
  run(who, 'admin-save-lineup', {
    date: TODAY,
    part: 'first',
    format: 'groups',
    groups,
    published,
    baseUpdatedAt: await savedAt(),
  });

const published = async (who: Who) => {
  const result = await devices[who].client.rpc('published_lineups');
  if (result.error) throw new Error(result.error.message);
  return result.data as unknown;
};

describe('立ち順', () => {
  it('公開するまで、部員には見えない', async () => {
    expect(await save(false)).toMatchObject({ ok: true });

    expect(await published('member')).toEqual([]);
    expect((await devices.member.client.from('lineups').select('*')).data).toEqual([]);
    expect((await devices.captain.client.from('lineups').select('part')).data).toHaveLength(1);
  });

  it('公開すると、並び順のまま名前つきで読める', async () => {
    await save(false);
    await save(true);

    expect(await published('member')).toEqual([
      {
        part: 'first',
        format: 'groups',
        groups: [
          [
            { id: ids.other, name: 'other' },
            { id: ids.member, name: 'member' },
          ],
        ],
      },
    ]);
  });

  it('承認待ちの人には見せない', async () => {
    await save(true);
    await sql`update public.members set approved = false where id = ${ids.member}`;

    expect(await published('member')).toEqual([]);
  });

  it('的割りは9列で保存でき、空の列も残る', async () => {
    const groups = Array.from({ length: 9 }, (_, index) => (index === 0 ? [ids.member] : []));
    await run('captain', 'admin-save-lineup', {
      date: TODAY,
      part: 'first',
      format: 'targets',
      groups,
      published: true,
    });

    const [lineup] = (await published('other')) as { groups: unknown[][] }[];
    expect(lineup!.groups).toHaveLength(9);
    expect(lineup!.groups[1]).toEqual([]);
  });

  it('名簿にいない人と、日付が変わった保存は拒否する', async () => {
    expect(await save(true, [['00000000-0000-0000-0000-000000000000']])).toMatchObject({
      ok: false,
    });
    expect(
      await run('captain', 'admin-save-lineup', {
        date: '2000-01-01',
        part: 'first',
        format: 'groups',
        groups: [[ids.member]],
      }),
    ).toEqual({ ok: false, error: '日付が変わりました。画面を開き直してください。' });
  });

  it('削除でき、部員を削除すると名前が消える', async () => {
    await save(true);
    await run('captain', 'admin-delete-member', { memberId: ids.other, deleteRecords: true });

    expect(await published('member')).toMatchObject([{ groups: [[{ name: 'member' }]] }]);

    await run('captain', 'admin-delete-lineup', {
      date: TODAY,
      part: 'first',
      baseUpdatedAt: await savedAt(),
    });
    expect(await published('member')).toEqual([]);
  });

  it('前の日の立ち順は、夜の処理で消す', async () => {
    await save(true);
    await sql`update public.lineups set practice_date = practice_date - 1`;
    await runNightly(sql, toInstant(TODAY, '22:15'));

    const [row] = await sql<{ count: number }[]>`select count(*)::int as count from public.lineups`;
    expect(row!.count).toBe(0);
  });
});

const lineupDay = async (who: Who) => {
  const result = await devices[who].client.rpc('lineup_day');
  if (result.error) throw new Error(result.error.message);
  return result.data as {
    lineups: { updatedBy: string }[];
    exceptions: object[];
  } | null;
};

describe('立ち順を作る人', () => {
  it.each(['men_vice_captain', 'women_vice_captain', 'chief_manager'])(
    '%s は作れて、連絡の理由は読めない',
    async (role) => {
      await sql`update public.members set role = ${role} where id = ${ids.other}`;
      await sql`insert into public.exceptions (date, member_id, kind, memo)
        values (${TODAY}, ${ids.member}, 'absent_notice', 'ないしょの事情')`;

      expect(await save(true, [[ids.member]], 'other')).toMatchObject({ ok: true });
      const day = await lineupDay('other');
      expect(day).toMatchObject({ lineups: [{ updatedBy: 'other' }] });
      expect(day!.exceptions).toHaveLength(1);
      expect(JSON.stringify(day)).not.toContain('ないしょ');
      expect((await devices.other.client.from('exceptions').select('memo')).data).toEqual([]);
    },
  );

  it.each(['member', 'vice', 'treasurer'])('%s は作れず、材料も読めない', async (role) => {
    await sql`update public.members set role = ${role} where id = ${ids.other}`;

    expect(await save(true, [[ids.member]], 'other')).toMatchObject({
      ok: false,
      error: expect.stringContaining('立ち順を作れるのは') as unknown,
    });
    expect(await run('other', 'admin-delete-lineup', { date: TODAY, part: 'first' })).toMatchObject(
      { ok: false },
    );
    expect(await lineupDay('other')).toBeNull();
  });
});

describe('同時の編集', () => {
  const saveFrom = (base: string | null, now: Date) =>
    run(
      'captain',
      'admin-save-lineup',
      {
        date: TODAY,
        part: 'first',
        format: 'groups',
        groups: [[ids.member]],
        baseUpdatedAt: base,
      },
      now,
    );

  it('あとから保存する人は、黙って上書きできない', async () => {
    expect(await saveFrom(null, NOW)).toMatchObject({ ok: true });
    const first = await savedAt();

    expect(await saveFrom(null, NOW)).toMatchObject({
      ok: false,
      error: expect.stringContaining('ほかの人が先に') as unknown,
    });
    expect(await saveFrom(first, toInstant(TODAY, '12:05'))).toMatchObject({ ok: true });
    expect(await saveFrom(first, toInstant(TODAY, '12:06'))).toMatchObject({ ok: false });
    expect(
      await run('captain', 'admin-delete-lineup', {
        date: TODAY,
        part: 'first',
        baseUpdatedAt: first,
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('承認待ちの部員の数', () => {
  it('主将には数を返し、部員には 0 を返す', async () => {
    await sql`update public.members set approved = false where id = ${ids.other}`;

    expect((await devices.captain.client.rpc('home')).data).toMatchObject({ pendingMembers: 1 });
    expect((await devices.member.client.rpc('home')).data).toMatchObject({ pendingMembers: 0 });
  });
});
