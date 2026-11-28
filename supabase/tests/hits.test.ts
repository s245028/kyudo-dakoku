// 的中の記録。権限、二重計上の防止、訂正と削除、履歴、月の境目、更新の通知
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant, type Role } from '../../packages/core/src/index.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
const TODAY = '2026-11-28';
const at = (time: string) => toInstant(TODAY, time);
const containing = (text: string): unknown => expect.stringContaining(text);

type Who = 'member' | 'other' | 'vice' | 'captain';
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Who, string>;

const setStartDate = (value: string | null) =>
  sql`update public.settings
    set value = coalesce(${value === null ? null : sql.json(value)}, 'null'::jsonb)
    where key = 'hitStartDate'`;

beforeEach(async () => {
  await clearRecords(sql);
  await setStartDate('2026-11-01');
  const roles: Record<Who, Role> = {
    member: 'member',
    other: 'member',
    vice: 'vice',
    captain: 'captain',
  };
  for (const [who, role] of Object.entries(roles) as [Who, Role][]) {
    devices[who] = await signInDevice();
    ids[who] = (await insertMember(sql, { role, auth_user_id: devices[who].userId })).id;
  }
});

afterAll(async () => {
  await clearRecords(sql);
  await setStartDate(null);
  await sql.end();
});

const save = (who: Who, entries: object[], options: object = {}, now = at('18:00')) =>
  runAction({ sql, userId: devices[who].userId, now }, 'save-hits', {
    date: TODAY,
    entries,
    ...options,
  });

const total = (
  category: string,
  shots: number,
  hits: number,
  baseRevision: number | null = null,
) => ({
  category,
  mode: 'total',
  shots,
  hits,
  baseRevision,
});

const records = () =>
  sql<
    {
      memberId: string;
      date: string;
      category: string;
      mode: string;
      shots: number;
      hits: number;
      revision: number;
      updatedBy: string | null;
    }[]
  >`select member_id as "memberId", practice_date::text as date, category, mode, shots, hits,
      revision, updated_by as "updatedBy"
    from public.hit_records order by practice_date, category`;
const history = () =>
  sql<{ category: string; before: object | null; after: object | null; changedBy: string }[]>`
    select category, before, after, changed_by as "changedBy"
    from public.hit_record_history order by id`;
const revisionOf = async (category: string) =>
  (await records()).find((record) => record.category === category)!.revision;

describe('本人の記録', () => {
  it('合計と一射ずつを、区分ごとに1回で保存する', async () => {
    const result = await save('member', [
      total('drill', 28, 15),
      {
        category: 'standing',
        mode: 'shots',
        rows: [
          [1, 0, 1, 1],
          [1, 1, null, null],
        ],
        baseRevision: null,
      },
    ]);

    expect(result).toMatchObject({ ok: true, conflict: false });
    expect(await records()).toMatchObject([
      { category: 'drill', mode: 'total', shots: 28, hits: 15 },
      { category: 'standing', mode: 'shots', shots: 6, hits: 5, updatedBy: ids.member },
    ]);
  });

  it('同じ日と区分は1件で、直すと足さずに置き換わる', async () => {
    await save('member', [total('drill', 20, 11)]);
    await save('member', [total('drill', 28, 15, await revisionOf('drill'))]);

    expect(await records()).toMatchObject([{ shots: 28, hits: 15 }]);
  });

  it('結果が届かず同じ内容を送り直しても、二重にならない', async () => {
    await save('member', [total('drill', 20, 11)]);
    const again = await save('member', [total('drill', 20, 11)]);

    expect(again).toMatchObject({ ok: true, conflict: false });
    expect(await records()).toHaveLength(1);
    expect(await history()).toHaveLength(1);
  });

  it('1射も残らなければ消える', async () => {
    await save('member', [{ category: 'self', mode: 'shots', rows: [[1, null, null, null]] }]);

    await save('member', [
      {
        category: 'self',
        mode: 'shots',
        rows: [[null, null, null, null]],
        baseRevision: await revisionOf('self'),
      },
    ]);

    expect(await records()).toEqual([]);
  });

  it.each([
    [{ shots: 4, hits: 5 }, '的中数'],
    [{ shots: 201, hits: 5 }, '射数'],
    [{ shots: 0, hits: 0 }, '射数'],
  ])('%o は拒否する', async (change, message) => {
    const result = await save('member', [{ ...total('drill', 4, 1), ...change }]);

    expect(result).toMatchObject({ ok: false, error: containing(message) });
  });

  it.each([
    ['2026-10-31', '開始日より前'],
    ['2026-11-29', '先の日'],
  ])('%s の分は拒否する', async (date, message) => {
    const result = await save('member', [total('drill', 4, 1)], { date });

    expect(result).toMatchObject({ ok: false, error: containing(message) });
  });

  it('開始日が決まるまでは記録できない', async () => {
    await setStartDate(null);

    expect(await save('member', [total('drill', 4, 1)])).toMatchObject({ ok: false });
  });

  it('承認前の人は記録できない', async () => {
    await sql`update public.members set approved = false where id = ${ids.member}`;

    expect(await save('member', [total('drill', 4, 1)])).toMatchObject({
      ok: false,
      error: containing('承認'),
    });
  });
});

describe('訂正と削除', () => {
  beforeEach(async () => {
    await save('member', [total('drill', 16, 10)]);
  });

  it.each(['other', 'captain'] as const)('%s はほかの人の記録を直せない', async (who) => {
    const result = await save(who, [total('drill', 16, 9, await revisionOf('drill'))], {
      memberId: ids.member,
    });

    expect(result).toMatchObject({ ok: false, error: containing('本人と副務') });
    expect(await records()).toMatchObject([{ hits: 10 }]);
  });

  it('副務は訂正と削除ができ、誰が何を変えたかが残る', async () => {
    const options = { memberId: ids.member };
    await save('vice', [total('drill', 16, 9, await revisionOf('drill'))], options, at('19:50'));
    await save(
      'vice',
      [{ category: 'drill', delete: true, baseRevision: await revisionOf('drill') }],
      options,
      at('20:00'),
    );

    expect(await records()).toEqual([]);
    expect(await history()).toMatchObject([
      { before: null, after: { shots: 16, hits: 10 }, changedBy: ids.member },
      { before: { hits: 10 }, after: { hits: 9 }, changedBy: ids.vice },
      { before: { hits: 9 }, after: null, changedBy: ids.vice },
    ]);
  });

  it('副務は、ほかの人のない記録を足せない', async () => {
    const result = await save('vice', [total('self', 4, 1)], { memberId: ids.member });

    expect(result).toMatchObject({ ok: false, error: containing('訂正と削除だけ') });
  });

  it('副務が直したあとに、古い内容では上書きできず、どの区分も変わらない', async () => {
    const stale = await revisionOf('drill');
    await save('vice', [total('drill', 16, 9, stale)], { memberId: ids.member });

    const result = await save('member', [total('drill', 20, 12, stale), total('self', 4, 1)]);

    expect(result).toMatchObject({ ok: true, conflict: true, records: [{ hits: 9 }] });
    expect(await records()).toMatchObject([{ category: 'drill', hits: 9 }]);
  });

  it('消して作り直した記録を、前の番号では上書きできない', async () => {
    const first = await revisionOf('drill');
    await save('member', [{ category: 'drill', delete: true, baseRevision: first }]);
    await save('member', [total('drill', 8, 2)]);

    const result = await save('member', [total('drill', 20, 12, first)]);

    expect(result).toMatchObject({ conflict: true });
  });

  it('同じ人が続けて直した分は、履歴を1件にまとめる', async () => {
    await save('member', [total('drill', 20, 12, await revisionOf('drill'))], {}, at('18:03'));
    await save('member', [total('drill', 24, 14, await revisionOf('drill'))], {}, at('18:20'));

    expect(await history()).toMatchObject([
      { before: null, after: { shots: 20 } },
      { before: { shots: 20 }, after: { shots: 24 } },
    ]);
  });

  it('部員を削除すると、記録と履歴も消える', async () => {
    await runAction(
      { sql, userId: devices.captain.userId, now: at('21:00') },
      'admin-delete-member',
      { memberId: ids.member, deleteRecords: true },
    );

    expect(await records()).toEqual([]);
    expect(await history()).toEqual([]);
  });

  it('記録がある人は、承認待ちの一覧からは削除できない', async () => {
    const result = await runAction(
      { sql, userId: devices.captain.userId, now: at('21:00') },
      'admin-delete-member',
      { memberId: ids.member },
    );

    expect(result).toMatchObject({ ok: false, error: containing('記録がある') });
  });
});

describe('読める範囲', () => {
  beforeEach(async () => {
    await save('member', [total('drill', 16, 10)]);
  });

  it('記録は全員が読め、履歴は本人と副務だけが読める', async () => {
    const count = async (who: Who, table: string) =>
      (await devices[who].client.from(table).select('member_id')).data?.length;

    expect(await count('other', 'hit_records')).toBe(1);
    expect(await count('other', 'hit_record_history')).toBe(0);
    expect(await count('captain', 'hit_record_history')).toBe(0);
    expect(await count('member', 'hit_record_history')).toBe(1);
    expect(await count('vice', 'hit_record_history')).toBe(1);
  });

  it('アプリから表を直接書き換えられない', async () => {
    const { error: insert } = await devices.member.client.from('hit_records').insert({
      member_id: ids.member,
      practice_date: TODAY,
      category: 'self',
      mode: 'total',
      shots: 4,
      hits: 4,
      revision: 1,
      updated_at: new Date().toISOString(),
    });
    const { error: update } = await devices.member.client
      .from('hit_records')
      .update({ hits: 16 })
      .eq('member_id', ids.member);
    const { error: remove } = await devices.member.client
      .from('hit_record_history')
      .delete()
      .eq('member_id', ids.member);

    expect([insert?.code, update?.code, remove?.code]).toEqual(['42501', '42501', '42501']);
  });

  it('承認前の人は何も読めない', async () => {
    const outsider = await signInDevice();
    await insertMember(sql, { approved: false, auth_user_id: outsider.userId });

    const table: unknown = (await outsider.client.from('hit_records').select('shots')).data;
    const days: unknown = (await outsider.client.rpc('hit_days', { p_from: TODAY, p_to: TODAY }))
      .data;

    expect([table, days]).toEqual([[], []]);
  });

  it('期間の両端の日を含め、部員と日ごとにまとめて返す', async () => {
    await save('member', [total('standing', 4, 4)], { date: '2026-11-01' });
    await save('other', [total('self', 8, 2)], { date: '2026-11-01' });
    await setStartDate('2026-10-01');
    await save('member', [total('drill', 12, 3)], { date: '2026-10-31' });

    const read = async (from: string, to: string) => {
      const data: unknown = (await devices.other.client.rpc('hit_days', { p_from: from, p_to: to }))
        .data;
      return data as unknown[][];
    };

    expect(await read('2026-10-31', '2026-10-31')).toEqual([
      [ids.member, '2026-10-31', 0, 0, 12, 3, 0, 0],
    ]);
    const november = await read('2026-11-01', '2026-11-30');
    expect(november).toHaveLength(3);
    expect(november).toContainEqual([ids.member, TODAY, 0, 0, 16, 10, 0, 0]);
  });
});
