import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runNightly } from '../functions/_shared/nightly.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
/** 月曜日。部員は月5があるので、集合は19:15、申請の締め切りは18:15 */
const DATE = '2026-11-30';
const NEXT_DATE = '2026-12-01';
/** seed.sql のローカル用の値 */
const QR = 'LOCAL-TEST-QR';
const at = (time: string, date = DATE) => toInstant(date, time);

type Who = 'captain' | 'member';
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Who, string>;

beforeEach(async () => {
  await clearRecords(sql);
  for (const who of ['captain', 'member'] as const) {
    devices[who] = await signInDevice();
    const created = await insertMember(sql, { role: who, auth_user_id: devices[who].userId });
    ids[who] = created.id;
  }
  await sql`insert into public.koma (member_id, mon5) values (${ids.member}, true)`;
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

const run = (who: Who, action: string, params: object, now: Date) =>
  runAction({ sql, userId: devices[who].userId, now }, action, params as Record<string, unknown>);

async function must(who: Who, action: string, params: object, now: Date) {
  const result = await run(who, action, params, now);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** 5コマが休講になった申請 */
const request = (time = '12:00') =>
  must('member', 'submit-koma-change', { date: DATE, kind: 'no_koma', reason: '休講' }, at(time));

const requests = () =>
  sql<{ id: string; kind: string; approval: string | null; base: string }[]>`
    select id, kind, approval, to_char(base_deadline, 'HH24:MI') as base
    from public.exceptions where member_id = ${ids.member}`;

const review = async (approval: string, now: Date) => {
  const [row] = await requests();
  return must('captain', 'admin-review-notice', { exceptionId: row!.id, approval }, now);
};

async function attendance() {
  const [row] = await sql<{ result: string; deadline: string }[]>`
    select final_result as result, to_char(deadline, 'HH24:MI') as deadline
    from public.attendance where member_id = ${ids.member} and practice_date = ${DATE}`;
  return row;
}

const penalties = () =>
  sql<{ reason: string; counted: string | null }[]>`
    select reason, counted_from::text as counted from public.penalties
    where member_id = ${ids.member}`;

describe('コマ変更の申請', () => {
  it('承認待ちとして保存し、主将の承認待ちの数に入る', async () => {
    const result = await request();

    expect(await requests()).toMatchObject([
      { kind: 'no_koma', approval: 'pending', base: '19:15' },
    ]);
    expect(result).toMatchObject({
      home: { exceptions: [{ approval: 'pending', selfSubmitted: true }] },
    });
    const captain = await must('captain', 'set-koma', { koma: {} }, at('12:00'));
    expect(captain).toMatchObject({ home: { pendingNotices: 1 } });
  });

  it('締め切り後は受け付けず、締め切り前は取り消せる', async () => {
    expect(
      await run(
        'member',
        'submit-koma-change',
        { date: DATE, kind: 'no_koma', reason: '休講' },
        at('18:16'),
      ),
    ).toMatchObject({ ok: false });

    await request('18:00');
    await must('member', 'cancel-koma-change', { date: DATE }, at('18:15'));
    expect(await requests()).toEqual([]);
  });

  it('主将が入力した臨時変更は、申請の出し直しや取り消しで消えない', async () => {
    await must(
      'captain',
      'admin-add-exception',
      { date: DATE, memberId: ids.member, kind: 'koma4' },
      at('09:00'),
    );
    await request();
    await must('member', 'cancel-koma-change', { date: DATE }, at('12:00'));

    expect(await requests()).toMatchObject([{ kind: 'koma4', approval: null }]);
  });

  it('承認すると集合時刻が変わり、記録済みの遅刻が判定し直される', async () => {
    await request();
    // 変更前（19:15）より前、申請した時刻（17:00）より後に入室
    await must('member', 'scan', { qr: QR }, at('18:00'));
    expect(await penalties()).toEqual([]);

    await review('approved', at('18:30'));

    expect(await attendance()).toEqual({ result: 'late', deadline: '17:00' });
    expect(await penalties()).toEqual([{ reason: '遅刻', counted: null }]);

    await review('rejected', at('19:00'));
    expect(await attendance()).toEqual({ result: 'present', deadline: '19:15' });
    expect(await penalties()).toEqual([]);
  });

  it('承認待ちのまま来なければ保留し、後日の判断は承認・却下の内容で判定する', async () => {
    await request();
    await runNightly(sql, at('22:15'));
    expect(await attendance()).toEqual({ result: 'absent_pending', deadline: '19:15' });
    expect(await penalties()).toEqual([]);

    await review('approved', at('09:00', NEXT_DATE));
    expect(await attendance()).toEqual({ result: 'absent_unexcused', deadline: '17:00' });
    expect(await penalties()).toEqual([{ reason: '無断欠席', counted: NEXT_DATE }]);

    await review('rejected', at('09:05', NEXT_DATE));
    expect(await attendance()).toEqual({ result: 'absent_unexcused', deadline: '19:15' });
  });
});
