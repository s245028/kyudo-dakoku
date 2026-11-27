import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runNightly } from '../functions/_shared/nightly.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
/** 月曜日。コマ表がなければ集合は17:00、連絡の締め切りは16:00 */
const DATE = '2026-11-30';
const NEXT_DATE = '2026-12-01';
/** seed.sql のローカル用の値 */
const QR = 'LOCAL-TEST-QR';
const at = (time: string, date = DATE) => toInstant(date, time);

type Who = 'captain' | 'vice' | 'member';
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Who, string>;

beforeEach(async () => {
  await clearRecords(sql);
  await sql`update public.settings set value = 'null'
    where key in ('dojoLatitude', 'dojoLongitude')`;
  for (const who of ['captain', 'vice', 'member'] as const) {
    devices[who] = await signInDevice();
    const created = await insertMember(sql, { role: who, auth_user_id: devices[who].userId });
    ids[who] = created.id;
  }
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

const send = (kind: string, time = '12:00', reason = '授業のため') =>
  must('member', 'submit-notice', { date: DATE, kind, reason }, at(time));

const notices = () =>
  sql<
    { id: string; kind: string; memo: string; approval: string | null; rejection: string }[]
  >`select id, kind, memo, approval, rejection_reason as rejection from public.exceptions
    where kind in ('absent_notice', 'late_notice') order by created_at`;

const review = async (approval: string, now: Date, rejectionReason = '') => {
  const [notice] = await notices();
  return must(
    'captain',
    'admin-review-notice',
    { exceptionId: notice!.id, approval, rejectionReason },
    now,
  );
};

async function attendance() {
  const [row] = await sql<{ result: string; deadline: string }[]>`
    select final_result as result, to_char(deadline, 'HH24:MI') as deadline
    from public.attendance where member_id = ${ids.member} and practice_date = ${DATE}`;
  return row;
}

const penaltyReasons = async () => {
  const rows = await sql<{ reason: string }[]>`
    select reason from public.penalties where member_id = ${ids.member}`;
  return rows.map((row) => row.reason);
};

describe('連絡を送る', () => {
  it('締め切り内は承認待ちになり、本人と主将に状態を返す', async () => {
    const result = await send('absent_notice');

    expect(await notices()).toMatchObject([{ memo: '授業のため', approval: 'pending' }]);
    expect(result).toMatchObject({
      home: {
        exceptions: [{ approval: 'pending', selfSubmitted: true }],
        pendingNotices: 0,
      },
    });
    const captain = await must(
      'captain',
      'submit-notice',
      { date: NEXT_DATE, kind: 'late_notice', reason: '実験' },
      at('12:00'),
    );
    expect(captain).toMatchObject({ home: { pendingNotices: 2 } });
  });

  it('出し直すと前の連絡と入れ替わり、取り消すと消える', async () => {
    await send('absent_notice');
    await send('late_notice', '13:00', '電車の遅れ');

    expect(await notices()).toMatchObject([{ kind: 'late_notice', memo: '電車の遅れ' }]);

    await must('member', 'cancel-notice', { date: DATE }, at('16:00'));
    expect(await notices()).toEqual([]);
  });

  it('理由がなければ受け付けない', async () => {
    const result = await run(
      'member',
      'submit-notice',
      { date: DATE, kind: 'absent_notice', reason: ' ' },
      at('12:00'),
    );

    expect(result).toEqual({ ok: false, error: '理由を書いてください。' });
  });

  it('締め切り後は承認の対象外になり、取り消せない', async () => {
    await send('absent_notice', '16:30');

    expect(await notices()).toMatchObject([{ approval: null }]);
    expect(await run('member', 'cancel-notice', { date: DATE }, at('16:31'))).toMatchObject({
      ok: false,
    });
    await runNightly(sql, at('22:15'));
    expect(await attendance()).toMatchObject({ result: 'absent_notice_overdue' });
    expect(await penaltyReasons()).toEqual(['欠席（連絡遅れ）']);
  });

  it('主将が入力した連絡は、本人が変えられず、承認の対象でもない', async () => {
    await must(
      'captain',
      'admin-add-exception',
      { date: DATE, memberId: ids.member, kind: 'absent_notice' },
      at('12:00'),
    );
    const [entered] = await notices();

    expect(
      await run(
        'member',
        'submit-notice',
        { date: DATE, kind: 'late_notice', reason: 'x' },
        at('12:00'),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await run(
        'captain',
        'admin-review-notice',
        { exceptionId: entered!.id, approval: 'rejected' },
        at('12:00'),
      ),
    ).toMatchObject({ ok: false });
  });
});

describe('承認と却下', () => {
  it.each(['vice', 'member'] as const)('%s は承認できない', async (who) => {
    await send('absent_notice');
    const [notice] = await notices();

    expect(
      await run(
        who,
        'admin-review-notice',
        { exceptionId: notice!.id, approval: 'approved' },
        at('12:00'),
      ),
    ).toEqual({ ok: false, error: 'この操作ができるのは、主将と管理者だけです。' });
  });

  it('遅刻の連絡が承認待ちの間は罰を保留し、却下でつき、承認で外れる', async () => {
    await send('late_notice');
    const scanned = await must('member', 'scan', { qr: QR }, at('17:10'));

    expect(scanned).toMatchObject({ scan: { penaltyAdded: false, penaltyPending: true } });
    expect(await attendance()).toMatchObject({ result: 'late_pending' });
    expect(await penaltyReasons()).toEqual([]);

    await review('rejected', at('18:00'), '理由が足りません');
    expect(await notices()).toMatchObject([
      { approval: 'rejected', rejection: '理由が足りません' },
    ]);
    expect(await attendance()).toMatchObject({ result: 'late' });
    expect(await penaltyReasons()).toEqual(['遅刻']);

    await review('approved', at('18:05'));
    expect(await attendance()).toMatchObject({ result: 'late_notified' });
    expect(await penaltyReasons()).toEqual([]);
  });

  it('承認待ちのまま夜を過ぎても罰をつけず、後日の判断は記録した集合時刻で判定する', async () => {
    await send('absent_notice');
    await runNightly(sql, at('22:15'));

    expect(await attendance()).toMatchObject({ result: 'absent_pending' });
    expect(await penaltyReasons()).toEqual([]);

    // そのあとコマ表を変えても、過去の日の集合時刻は変えない
    await sql`insert into public.koma (member_id, mon5) values (${ids.member}, true)`;
    await review('rejected', at('09:00', NEXT_DATE));

    expect(await attendance()).toEqual({ result: 'absent_unexcused', deadline: '17:00' });
    expect(await penaltyReasons()).toEqual(['無断欠席']);

    await review('approved', at('09:05', NEXT_DATE));
    expect(await attendance()).toMatchObject({ result: 'absent_notified' });
    expect(await penaltyReasons()).toEqual([]);
  });

  it('32: 後日の却下でつく罰は、却下した日から数える。判定し直しても変わらない', async () => {
    await send('absent_notice');
    await runNightly(sql, at('22:15'));
    const later = '2026-12-10';
    await review('rejected', at('09:00', later));
    const countedFrom = () => sql<{ date: string; counted: string | null }[]>`
      select practice_date::text as date, counted_from::text as counted from public.penalties
      where member_id = ${ids.member}`;

    expect(await countedFrom()).toEqual([{ date: DATE, counted: later }]);

    // 手動判定で外して戻しても、数え始めは却下した日のまま
    const manual = (judgement: string) =>
      must(
        'captain',
        'admin-set-manual',
        { date: DATE, memberId: ids.member, judgement, reason: '確認' },
        at('09:00', '2026-12-12'),
      );
    await manual('present');
    expect(await countedFrom()).toEqual([]);
    await manual('');
    expect(await countedFrom()).toEqual([{ date: DATE, counted: later }]);

    const home = await must('member', 'set-koma', { koma: {} }, at('09:00', '2026-12-12'));
    expect(home).toMatchObject({ home: { penalties: [{ date: DATE, countedFrom: later }] } });
  });

  it('先の日の連絡は、承認しても出欠を作らない', async () => {
    await must(
      'member',
      'submit-notice',
      { date: NEXT_DATE, kind: 'absent_notice', reason: '帰省' },
      at('12:00'),
    );
    await review('approved', at('12:30'));

    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.attendance`;
    expect(row!.count).toBe(0);
  });

  it('承認した主将を削除しても、連絡は残る', async () => {
    await send('absent_notice');
    await review('approved', at('12:30'));
    const other = await signInDevice();
    await insertMember(sql, { role: 'captain', auth_user_id: other.userId });

    const result = await runAction(
      { sql, userId: other.userId, now: at('13:00') },
      'admin-delete-member',
      { memberId: ids.captain, deleteRecords: true },
    );

    expect(result).toMatchObject({ ok: true });
    expect(await notices()).toMatchObject([{ approval: 'approved' }]);
  });
});

describe('引退した人', () => {
  it('参加を取り消すと、その日の自分の連絡も消える', async () => {
    await sql`update public.members set status = 'retired' where id = ${ids.member}`;
    await must('member', 'join', { date: DATE }, at('12:00'));
    await send('absent_notice', '12:30');
    await must('member', 'unjoin', { date: DATE }, at('13:00'));

    expect(await notices()).toEqual([]);
  });
});

describe('読み取りの権限', () => {
  it('理由を読めるのは本人と主将・副務だけ', async () => {
    await send('absent_notice');
    const other = await signInDevice();
    await insertMember(sql, { auth_user_id: other.userId });
    const read = async (device: Device) => {
      const { data } = await device.client.from('exceptions').select('memo');
      return data;
    };

    expect(await read(devices.member)).toHaveLength(1);
    expect(await read(devices.captain)).toHaveLength(1);
    expect(await read(devices.vice)).toHaveLength(1);
    expect(await read(other)).toEqual([]);
  });
});
