import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { judgeDate } from '../functions/_shared/judge.ts';
import { inTransaction } from '../functions/_shared/db.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
const QR = 'LOCAL-TEST-QR';
/** 月曜日 */
const DATE = '2026-11-30';
const at = (time: string, seconds = 0) =>
  new Date(toInstant(DATE, time).getTime() + seconds * 1000);

let device: Device;

const containing = (text: string): unknown => expect.stringContaining(text);

beforeEach(async () => {
  await clearRecords(sql);
  await resetSettings();
  device = await signInDevice();
});

afterAll(async () => {
  await clearRecords(sql);
  await resetSettings();
  await sql.end();
});

async function resetSettings() {
  await sql`update public.practice_rules set end_time = null`;
  await sql`update public.settings set value = 'false' where key = 'komaLocked'`;
  await sql`update public.settings set value = 'null'
    where key in ('dojoLatitude', 'dojoLongitude')`;
}

function run(action: string, params: object = {}, now = at('16:00'), userId = device.userId) {
  return runAction({ sql, userId, now }, action, params as Record<string, unknown>);
}

type Scan = { duplicate: boolean; id: number; kind: string; penaltyAdded: boolean };

async function scanAt(time: Date, params: object = {}) {
  const result = await run('scan', { qr: QR, ...params }, time);
  if (!result.ok) throw new Error(result.error);
  return (result as unknown as { scan: Scan }).scan;
}

const join = () => insertMember(sql, { auth_user_id: device.userId });
const retiredMember = () =>
  insertMember(sql, { auth_user_id: device.userId, status: 'retired', retired_on: '2026-10-01' });

const penalties = () =>
  sql<{ reason: string; auto_key: string }[]>`select reason, auto_key from public.penalties`;

const attendance = (memberId: string) =>
  sql<{ auto_result: string; final_result: string; note: string }[]>`
    select auto_result, final_result, note from public.attendance
    where practice_date = ${DATE} and member_id = ${memberId}`;

const judgeAll = (now = at('22:15')) =>
  inTransaction(sql, (tx) => judgeDate(tx, { date: DATE, now, memberIds: null }));

describe('部員登録', () => {
  const input = { studentNo: ' s1234567 ', name: '島根 太郎', gender: 'male', grade: 'B1' };

  it('承認待ちとして登録し、ホームの内容を返す', async () => {
    const result = await run('register', input);

    expect(result).toMatchObject({
      ok: true,
      home: { member: { studentNo: 'S1234567', approved: false, status: 'active' } },
    });
  });

  it('入力が正しくなければ登録しない', async () => {
    expect(await run('register', { ...input, name: '' })).toEqual({
      ok: false,
      error: '名前を入力してください。',
    });
  });

  it('使われている学生番号は拒否する', async () => {
    await run('register', input);
    const another = await signInDevice();

    const result = await run('register', input, at('16:00'), another.userId);

    expect(result).toMatchObject({ ok: false, error: containing('すでに登録') });
  });

  it('再登録を許可された学生番号は引き継ぎ、承認はやり直す', async () => {
    const { id, studentNo } = await insertMember(sql, { name: '元の名前' });

    const result = await run('register', { ...input, studentNo });

    expect(result).toMatchObject({
      ok: true,
      home: { member: { id, name: '元の名前', approved: false } },
    });
  });

  it('登録済みの端末は別の番号で登録できない', async () => {
    await join();

    expect((await run('register', input)).ok).toBe(false);
  });
});

describe('コマ表', () => {
  it('保存して上書きする', async () => {
    await join();
    await run('set-koma', { koma: { mon4: true } });

    const result = await run('set-koma', { koma: { tue5: true } });

    expect(result).toMatchObject({ home: { koma: { mon4: false, tue5: true } } });
  });

  it('ロック中は変更できない', async () => {
    await join();
    await sql`update public.settings set value = 'true' where key = 'komaLocked'`;

    expect(await run('set-koma', { koma: {} })).toMatchObject({
      ok: false,
      error: containing('確定済み'),
    });
  });
});

describe('打刻', () => {
  it('登録していない端末は拒否する', async () => {
    expect(await run('scan', { qr: QR })).toMatchObject({ ok: false });
  });

  it('25: 承認待ちは拒否する', async () => {
    await insertMember(sql, { auth_user_id: device.userId, approved: false });

    expect(await run('scan', { qr: QR })).toMatchObject({
      error: containing('主将の承認待ちです'),
    });
  });

  it('入口の QR でなければ拒否する', async () => {
    await join();

    expect(await run('scan', { qr: 'OTHER' })).toEqual({
      ok: false,
      error: '道場の入口QRではありません。',
    });
  });

  it('道場の位置が設定されていれば、離れた場所を拒否する', async () => {
    await join();
    await sql`update public.settings set value = '35.5' where key = 'dojoLatitude'`;
    await sql`update public.settings set value = '133.0' where key = 'dojoLongitude'`;

    expect((await run('scan', { qr: QR })).ok).toBe(false);
    const far = { latitude: 35.6, longitude: 133, accuracyMeters: 10 };
    expect((await run('scan', { qr: QR, position: far })).ok).toBe(false);
    const near = { latitude: 35.5, longitude: 133, accuracyMeters: 10 };
    expect((await run('scan', { qr: QR, position: near })).ok).toBe(true);
  });

  it('入室して退室する。120秒以内の2回目は無視する', async () => {
    await join();

    expect(await scanAt(at('16:00'))).toMatchObject({ kind: 'in', duplicate: false });
    expect(await scanAt(at('16:01'))).toMatchObject({ kind: 'in', duplicate: true });
    expect(await scanAt(at('18:00'))).toMatchObject({ kind: 'out' });
    expect(await penalties()).toEqual([]);
  });

  it('同時に2回読み取っても打刻は1つ', async () => {
    await join();

    const results = await Promise.all([scanAt(at('16:00')), scanAt(at('16:00'))]);

    expect(results.map((result) => result.duplicate).sort()).toEqual([false, true]);
  });

  it('2: 遅刻はその場で罰がつき、その人の分だけ判定する', async () => {
    const { id } = await join();
    await insertMember(sql);

    const result = await run('scan', { qr: QR }, at('17:00', 1));

    expect(result).toMatchObject({
      scan: { lateMinutes: 1, penaltyAdded: true, message: '遅刻 1分（前半・17:00基準）' },
      home: { penalties: [{ reason: '遅刻', baseCount: 1, tasks: [] }] },
    });
    expect(await attendance(id)).toMatchObject([{ auto_result: 'late' }]);
    expect(await sql`select 1 from public.attendance`).toHaveLength(1);
  });

  it('53: 練習の終了後の入室は、その場で無断欠席の罰がつく', async () => {
    const { id } = await join();
    await sql`update public.practice_rules set end_time = '21:00'`;

    const result = await run('scan', { qr: QR }, at('21:30'));

    expect(result).toMatchObject({
      scan: { lateMinutes: 0, missed: true, penaltyAdded: true },
      home: { penalties: [{ reason: '無断欠席' }] },
    });
    expect(await attendance(id)).toMatchObject([{ auto_result: 'absent_unexcused' }]);
  });

  it('54: 出欠を開いたときの判定は、罰を変えない', async () => {
    const { id } = await join();
    await sql`insert into public.exceptions (date, member_id, kind, contacted_at)
      values (${DATE}, ${id}, 'absent_notice', ${at('16:30')})`;
    const captain = await signInDevice();
    await insertMember(sql, { auth_user_id: captain.userId, role: 'captain' });
    const refresh = () => run('admin-refresh-attendance', {}, at('17:30'), captain.userId);

    expect(await refresh()).toMatchObject({ ok: true });
    expect(await attendance(id)).toMatchObject([{ auto_result: 'absent_notice_overdue' }]);
    expect(await penalties()).toEqual([]);

    await sql`delete from public.attendance`;
    await sql`insert into public.nightly_runs (practice_date, ran_at) values (${DATE}, ${at('22:15')})`;
    expect(await refresh()).toMatchObject({ ok: true });
    expect(await attendance(id)).toEqual([]);
  });

  it('締め切り内に連絡した遅刻は罰がつかない', async () => {
    const { id } = await join();
    await sql`insert into public.exceptions (date, member_id, kind, contacted_at)
      values (${DATE}, ${id}, 'late_notice', ${at('12:00')})`;

    expect(await scanAt(at('17:30'))).toMatchObject({ penaltyAdded: false });
    expect(await attendance(id)).toMatchObject([{ auto_result: 'late_notified' }]);
  });
});

describe('取り消し', () => {
  it('23: 遅刻の入室を取り消すと、罰が外れる', async () => {
    const { id } = await join();
    const { id: punchId } = await scanAt(at('17:05'));

    const result = await run('undo-scan', { punchId }, at('17:05', 60));

    expect(result).toMatchObject({ ok: true, home: { penalties: [] } });
    expect(await penalties()).toEqual([]);
    expect(await attendance(id)).toMatchObject([{ auto_result: 'not_arrived' }]);
    const [punch] = await sql`select canceled_at from public.punches`;
    expect(punch?.['canceled_at']).not.toBeNull();
  });

  it('時間を過ぎたら取り消せない', async () => {
    await join();
    const { id: punchId } = await scanAt(at('16:00'));

    expect((await run('undo-scan', { punchId }, at('16:00', 61))).ok).toBe(false);
  });

  it('他人の記録は取り消せない', async () => {
    await join();
    const { id: punchId } = await scanAt(at('16:00'));
    const another = await signInDevice();
    await insertMember(sql, { auth_user_id: another.userId });

    expect(await run('undo-scan', { punchId }, at('16:00', 5), another.userId)).toEqual({
      ok: false,
      error: '自分の記録ではありません',
    });
  });
});

describe('判定', () => {
  it('11: 夜の判定で無断欠席と罰。繰り返しても1件', async () => {
    const { id } = await join();

    expect(await judgeAll()).toMatchObject({ judged: 1 });
    await judgeAll();

    expect(await attendance(id)).toMatchObject([{ auto_result: 'absent_unexcused' }]);
    expect(await penalties()).toEqual([{ reason: '無断欠席', auto_key: `auto|${DATE}|${id}` }]);
  });

  it('手動判定を残し、罰を最終判定に合わせる', async () => {
    const { id } = await join();
    await judgeAll();
    await sql`update public.attendance set manual_result = 'exempt', manual_reason = '体調不良'`;

    await judgeAll();

    expect(await attendance(id)).toMatchObject([
      { auto_result: 'absent_unexcused', final_result: 'exempt' },
    ]);
    expect(await penalties()).toEqual([]);
  });

  it('17: やることを割り当てた罰は残し、重ねてつけない', async () => {
    await join();
    await judgeAll();
    await sql`insert into public.penalty_tasks (penalty_id, content)
      select id, '掃除' from public.penalties`;
    await sql`update public.attendance set manual_result = 'late'`;

    await judgeAll();

    expect(await penalties()).toMatchObject([{ reason: '無断欠席' }]);
  });

  it('対象でなくなった部員の過去の記録には触れない', async () => {
    const { id } = await join();
    await judgeAll();
    await sql`update public.members set status = 'graduated' where id = ${id}`;

    await judgeAll();

    expect(await attendance(id)).toHaveLength(1);
    expect(await penalties()).toHaveLength(1);
  });

  it('休みになった日は出欠一覧と手を付けていない罰を消す', async () => {
    const { id } = await join();
    await judgeAll();
    await sql`insert into public.exceptions (date, kind) values (${DATE}, 'day_off')`;

    await judgeAll();

    expect(await attendance(id)).toEqual([]);
    expect(await penalties()).toEqual([]);
  });
});

describe('参加登録', () => {
  it('引退した人が登録し、締め切り前に取り消す', async () => {
    await retiredMember();

    const joined = await run('join', { date: DATE }, at('12:00'));
    expect(joined).toMatchObject({ home: { exceptions: [{ kind: 'join', date: DATE }] } });

    const canceled = await run('unjoin', { date: DATE }, at('15:59'));
    expect(canceled).toMatchObject({ ok: true, home: { exceptions: [] } });
  });

  it('20: 集合の59分前は取り消せない', async () => {
    await retiredMember();
    await run('join', { date: DATE }, at('12:00'));

    expect((await run('unjoin', { date: DATE }, at('16:01'))).ok).toBe(false);
  });

  it('19: 登録して来なければ無断欠席', async () => {
    await retiredMember();
    await run('join', { date: DATE }, at('12:00'));

    await judgeAll();

    expect(await penalties()).toMatchObject([{ reason: '無断欠席' }]);
  });

  it('現役は登録できない', async () => {
    await join();

    expect((await run('join', { date: DATE })).ok).toBe(false);
  });

  it('休部中の人は拒否する', async () => {
    await insertMember(sql, { auth_user_id: device.userId, status: 'suspended' });

    expect(await run('join', { date: DATE })).toMatchObject({
      error: containing('休部・退部'),
    });
  });
});

describe('操作の指定', () => {
  it.each(['nope', 'toString', undefined])('%s は拒否する', async (action) => {
    expect(await runAction({ sql, userId: device.userId, now: at('16:00') }, action, {})).toEqual({
      ok: false,
      error: '不明な操作です',
    });
  });
});
