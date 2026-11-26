import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runNightly } from '../functions/_shared/nightly.ts';
import { clearRecords, connect, insertMember } from './helpers.ts';

const sql = connect();
/** 月曜日 */
const DATE = '2026-11-30';
const at = (time: string) => toInstant(DATE, time);

beforeEach(() => clearRecords(sql));

afterAll(async () => {
  await clearRecords(sql);
  await sql`delete from vault.secrets where name = 'nightly_url'`;
  await sql.end();
});

async function memberInRoom() {
  const { id } = await insertMember(sql);
  await sql`insert into public.punches (member_id, punched_at, kind, via)
    values (${id}, ${at('16:50')}, 'in', 'app')`;
  return id;
}

const attendance = () =>
  sql<{ member_id: string; auto_result: string; note: string }[]>`
    select member_id, auto_result, note from public.attendance`;

describe('夜の処理', () => {
  it('時刻の前は何もしない', async () => {
    await memberInRoom();

    expect(await runNightly(sql, at('22:14'))).toEqual({ ran: false });
    expect(await attendance()).toEqual([]);
  });

  it('11・24: 自動退室にして判定し、来ていない人に罰をつける', async () => {
    const present = await memberInRoom();
    const { id: absent } = await insertMember(sql);

    const result = await runNightly(sql, at('22:15'));

    expect(result).toEqual({ ran: true, date: DATE, checkedOut: 1, judged: 2 });
    const [checkout] = await sql<{ punched_at: Date }[]>`
      select punched_at from public.punches where kind = 'auto_out'`;
    expect(checkout?.punched_at).toEqual(at('22:00'));
    expect(await attendance()).toEqual(
      expect.arrayContaining([
        {
          member_id: present,
          auto_result: 'present',
          note: 'コマ表未登録 / 退室打刻なし',
        },
        { member_id: absent, auto_result: 'absent_unexcused', note: 'コマ表未登録' },
      ]),
    );
    expect(await sql`select member_id, reason from public.penalties`).toEqual([
      { member_id: absent, reason: '無断欠席' },
    ]);
  });

  it('同じ日に2回呼んでも、同時に呼んでも、1回だけ動く', async () => {
    await memberInRoom();

    const results = await Promise.all([runNightly(sql, at('22:15')), runNightly(sql, at('22:15'))]);
    results.push(await runNightly(sql, at('22:30')));

    expect(results.filter((result) => result.ran)).toHaveLength(1);
    expect(await sql`select 1 from public.punches where kind = 'auto_out'`).toHaveLength(1);
  });

  it('練習日でなくても自動退室はする', async () => {
    await memberInRoom();
    await sql`insert into public.exceptions (date, kind) values (${DATE}, 'day_off')`;

    expect(await runNightly(sql, at('22:15'))).toMatchObject({ checkedOut: 1, judged: 0 });
  });
});

describe('定期実行', () => {
  const post = (secret?: string) =>
    fetch(`${inject('stack').apiUrl}/functions/v1/nightly`, {
      method: 'POST',
      headers: secret ? { 'x-nightly-secret': secret } : {},
    });

  it('15分ごとに登録されている', async () => {
    const jobs = await sql`select schedule, command from cron.job where jobname = 'nightly'`;

    expect(jobs).toEqual([{ schedule: '*/15 * * * *', command: 'select private.call_nightly()' }]);
  });

  it.each([undefined, 'wrong'])('合言葉が違えば拒否する: %s', async (secret) => {
    expect((await post(secret)).status).toBe(401);
  });

  it('データベースから Edge Function を呼べる', async () => {
    // ローカルの呼び出し先。テスト用に一時的に登録する
    await sql`delete from vault.secrets where name = 'nightly_url'`;
    await sql`select vault.create_secret('http://kong:8000/functions/v1/nightly', 'nightly_url')`;
    const [last] = await sql<{ id: number }[]>`
      select coalesce(max(id), 0)::int as id from net._http_response`;

    await sql`select private.call_nightly()`;

    await expect
      .poll(
        async () => {
          const [response] = await sql<{ status: number; content: string }[]>`
            select status_code as status, content from net._http_response
            where id > ${last!.id} order by id limit 1`;
          return (
            response && { status: response.status, body: JSON.parse(response.content) as object }
          );
        },
        { timeout: 15_000, interval: 300 },
      )
      .toMatchObject({ status: 200, body: { ok: true } });
  });
});
