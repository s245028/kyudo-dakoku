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

const save = (published: boolean, groups: string[][] = [[ids.other, ids.member]]) =>
  run('captain', 'admin-save-lineup', {
    date: TODAY,
    part: 'first',
    format: 'groups',
    groups,
    published,
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

  it('的ごとは9列で保存でき、空の列も残る', async () => {
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

    await run('captain', 'admin-delete-lineup', { date: TODAY, part: 'first' });
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
