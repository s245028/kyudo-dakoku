// 部全体と部員ごとの予定。4役と管理者が変える
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant, type Role } from '../../packages/core/src/index.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
const TODAY = '2026-11-30';
const NOW = toInstant(TODAY, '12:00');
const containing = (text: string): unknown => expect.stringContaining(text);

type Who = 'captain' | 'womenVice' | 'chief' | 'vice' | 'member';
const ROLES: Record<Who, Role> = {
  captain: 'captain',
  womenVice: 'women_vice_captain',
  chief: 'chief_manager',
  vice: 'vice',
  member: 'member',
};
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Who, string>;

beforeEach(async () => {
  await clearRecords(sql);
  for (const [who, role] of Object.entries(ROLES) as [Who, Role][]) {
    devices[who] = await signInDevice();
    ids[who] = (await insertMember(sql, { role, auth_user_id: devices[who].userId })).id;
  }
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

const run = (who: Who, action: string, params: object) =>
  runAction(
    { sql, userId: devices[who].userId, now: NOW },
    action,
    params as Record<string, unknown>,
  );
const stored = () =>
  sql<{ id: string; date: string; memberId: string | null; kind: string; memo: string }[]>`
    select id, date::text, member_id as "memberId", kind, memo from public.exceptions
    order by date, kind`;

describe('予定の追加', () => {
  it.each(['captain', 'womenVice', 'chief'] as const)(
    '%s は期間で休みを入れられる',
    async (who) => {
      const result = await run(who, 'schedule-add', {
        from: '2026-12-26',
        to: '2026-12-28',
        kind: 'day_off',
        memo: '冬休み',
      });

      expect(result).toMatchObject({ ok: true, count: 3 });
      expect((await stored()).map((row) => [row.date, row.memberId])).toEqual([
        ['2026-12-26', null],
        ['2026-12-27', null],
        ['2026-12-28', null],
      ]);
    },
  );

  it.each(['vice', 'member'] as const)('%s は変えられない', async (who) => {
    const result = await run(who, 'schedule-add', { from: TODAY, kind: 'day_off' });

    expect(result).toMatchObject({ ok: false, error: containing('予定を変えられるのは') });
    expect(await stored()).toEqual([]);
  });

  it('同じ日・人・内容を入れ直すと置き換わる', async () => {
    const input = { from: TODAY, kind: 'koma4', memberId: ids.member };

    await run('chief', 'schedule-add', { ...input, memo: '補講' });
    await run('chief', 'schedule-add', { ...input, memo: '実習' });

    expect(await stored()).toMatchObject([{ memberId: ids.member, memo: '実習' }]);
  });

  it('過ぎた日を変えられるのは主将', async () => {
    const input = { from: '2026-11-29', kind: 'day_off' };

    expect(await run('womenVice', 'schedule-add', input)).toMatchObject({
      ok: false,
      error: containing('今日より前'),
    });
    expect(await run('captain', 'schedule-add', input)).toMatchObject({ ok: true });
  });

  it('いない部員は指定できない', async () => {
    const result = await run('chief', 'schedule-add', {
      from: TODAY,
      kind: 'day_off',
      memberId: '00000000-0000-0000-0000-000000000000',
    });

    expect(result).toMatchObject({ ok: false, error: containing('部員が見つかりません') });
  });
});

describe('予定の削除', () => {
  it('まとめて消せる', async () => {
    await run('chief', 'schedule-add', { from: TODAY, to: '2026-12-01', kind: 'day_off' });
    const rows = await stored();

    const result = await run('womenVice', 'schedule-delete', { ids: rows.map((row) => row.id) });

    expect(result).toMatchObject({ ok: true });
    expect(await stored()).toEqual([]);
  });

  it('過ぎた日が混ざると、主将以外は何も消せない', async () => {
    await run('captain', 'schedule-add', { from: '2026-11-29', to: TODAY, kind: 'day_off' });
    const targets = { ids: (await stored()).map((row) => row.id) };

    expect((await run('chief', 'schedule-delete', targets)).ok).toBe(false);
    expect(await stored()).toHaveLength(2);
    expect((await run('captain', 'schedule-delete', targets)).ok).toBe(true);
    expect(await stored()).toEqual([]);
  });

  it('連絡と、部員が申請したコマ変更は消えない', async () => {
    await sql`insert into public.exceptions (date, member_id, kind, approval) values
      (${TODAY}, ${ids.member}, 'koma4', 'pending'),
      (${TODAY}, ${ids.member}, 'late_notice', null)`;
    const targets = { ids: (await stored()).map((row) => row.id) };

    await run('captain', 'schedule-delete', targets);

    expect(await stored()).toHaveLength(2);
  });
});

describe('行事', () => {
  const event = {
    date: TODAY,
    title: '年末大射会',
    deadline: '09:00',
    startTime: '09:30',
    endTime: '15:00',
    shots: '20',
    memo: '的前',
  };
  const events = () =>
    sql<{ title: string; deadline: string; shots: number | null; memo: string }[]>`
      select event_title as title, to_char(event_deadline, 'HH24:MI') as deadline,
        event_shots as shots, memo
      from public.exceptions where kind = 'event' order by date`;

  it.each(['captain', 'womenVice', 'chief'] as const)('%s は行事を入れられる', async (who) => {
    expect(await run(who, 'event-save', event)).toMatchObject({ ok: true });
    expect(await events()).toEqual([
      { title: '年末大射会', deadline: '09:00', shots: 20, memo: '的前' },
    ]);
  });

  it.each(['vice', 'member'] as const)('%s は入れられない', async (who) => {
    expect(await run(who, 'event-save', event)).toMatchObject({ ok: false });
    expect(await events()).toEqual([]);
  });

  it('同じ日の行事は置き換わる', async () => {
    await run('chief', 'event-save', event);
    await run('chief', 'event-save', { ...event, title: '例会', shots: '' });

    expect(await events()).toMatchObject([{ title: '例会', shots: null }]);
  });

  it('過ぎた日は主将だけが入れ、消せる', async () => {
    const past = { ...event, date: '2026-11-29' };

    expect((await run('chief', 'event-save', past)).ok).toBe(false);
    expect((await run('captain', 'event-save', past)).ok).toBe(true);
    const targets = { ids: (await stored()).map((row) => row.id) };
    expect((await run('chief', 'schedule-delete', targets)).ok).toBe(false);
    expect((await run('captain', 'schedule-delete', targets)).ok).toBe(true);
    expect(await events()).toEqual([]);
  });

  it('予定を足す操作や、主将の臨時変更の操作では行事を入れられない', async () => {
    expect((await run('captain', 'schedule-add', { from: TODAY, kind: 'event' })).ok).toBe(false);
    expect((await run('captain', 'admin-add-exception', { date: TODAY, kind: 'event' })).ok).toBe(
      false,
    );
  });

  it('部員のホームに行事の内容が届き、行事の時刻で出欠を判定する', async () => {
    // 今日（月曜）は区分が分かれる日。行事があると全体の1区分になる
    await run('captain', 'event-save', event);
    await sql`insert into public.punches (member_id, punched_at, kind, via)
      values (${ids.member}, ${toInstant(TODAY, '09:10')}, 'in', 'app')`;

    await run('captain', 'admin-rejudge', { date: TODAY });

    expect(
      await sql`select part, to_char(deadline, 'HH24:MI') as deadline, final_result as result,
        note from public.attendance where member_id = ${ids.member}`,
    ).toEqual([{ part: 'whole', deadline: '09:00', result: 'late', note: '行事：年末大射会' }]);
  });

  it('部員のホームと立ち順の材料に、行事の内容が届く', async () => {
    const [row] = await sql<{ today: string }[]>`
      select private.practice_today()::text as today`;
    await run('captain', 'event-save', { ...event, date: row!.today, endTime: '' });
    const expected = {
      kind: 'event',
      event: {
        title: '年末大射会',
        deadline: '09:00',
        startTime: '09:30',
        endTime: null,
        shots: 20,
        memo: '的前',
      },
    };

    const home: unknown = (await devices.member.client.rpc('home')).data;
    const lineup: unknown = (await devices.womenVice.client.rpc('lineup_day')).data;

    expect(home).toMatchObject({ exceptions: [expected] });
    expect(lineup).toMatchObject({ exceptions: [expected] });
  });
});

describe('予定を読む', () => {
  beforeEach(async () => {
    await sql`insert into public.exceptions (date, member_id, kind, memo, approval) values
      (${TODAY}, ${ids.member}, 'day_off', '公欠', null),
      (${TODAY}, ${ids.member}, 'koma4', '申請の理由', 'pending'),
      (${TODAY}, ${ids.member}, 'late_notice', '連絡の理由', null)`;
  });

  const memos = async (who: Who) => {
    const { data } = await devices[who].client.from('exceptions').select('memo').order('memo');
    return data?.map((row: { memo: string }) => row.memo);
  };

  it('4役は役職の側が入れた予定だけを読め、理由のある連絡と申請は読めない', async () => {
    expect(await memos('womenVice')).toEqual(['公欠']);
    expect(await memos('chief')).toEqual(['公欠']);
    expect(await memos('captain')).toHaveLength(3);
  });

  it('部員の名前は承認済みの部員が読め、学生番号は含まない', async () => {
    const data: unknown = (await devices.member.client.rpc('member_directory')).data;
    const rows = data as Record<string, unknown>[];

    expect(rows).toHaveLength(5);
    expect(Object.keys(rows[0]!).sort()).toEqual(['gender', 'grade', 'id', 'name', 'status']);
  });

  it('承認前の人には名前を返さない', async () => {
    const outsider = await signInDevice();
    await insertMember(sql, { approved: false, auth_user_id: outsider.userId });

    const data: unknown = (await outsider.client.rpc('member_directory')).data;
    expect(data).toEqual([]);
  });
});
