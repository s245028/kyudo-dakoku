import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
/** 月曜日 */
const DATE = '2026-11-30';
const at = (time: string, date = DATE) => toInstant(date, time);

type Who = 'captain' | 'vice' | 'member';
const devices = {} as Record<Who, Device>;
const ids = {} as Record<Who, string>;
const studentNos = {} as Record<Who, string>;

const containing = (text: string): unknown => expect.stringContaining(text);

async function resetData() {
  await clearRecords(sql);
  await sql`update public.settings set value = '7' where key = 'penaltyDoublingDays'`;
  await sql`update public.penalty_types set base_count = 1`;
  await sql`delete from public.penalty_types where reason = '試験用の理由'`;
  await sql`delete from public.practice_rules where weekday = 3`;
}

beforeEach(async () => {
  await resetData();
  const roles = { captain: 'captain', vice: 'vice', member: 'member' } as const;
  for (const [who, role] of Object.entries(roles) as [Who, (typeof roles)[Who]][]) {
    devices[who] = await signInDevice();
    const created = await insertMember(sql, {
      role,
      grade: who === 'member' ? 'B2' : 'B3',
      auth_user_id: devices[who].userId,
    });
    ids[who] = created.id;
    studentNos[who] = created.studentNo;
  }
});

afterAll(async () => {
  await resetData();
  await sql.end();
});

const run = (who: Who, action: string, params: object = {}, now = at('12:00')) =>
  runAction({ sql, userId: devices[who].userId, now }, action, params as Record<string, unknown>);

async function must(who: Who, action: string, params: object = {}, now?: Date) {
  const result = await run(who, action, params, now);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const penalties = () =>
  sql<{ id: string; reason: string; completed_on: string | null }[]>`
    select id, reason, completed_on::text from public.penalties order by created_at, id`;
const tasks = () =>
  sql<{ id: string; content: string; done: boolean }[]>`
    select id, content, done_at is not null as done from public.penalty_tasks
    order by assigned_at, id`;
const member = async (id: string) => {
  const [row] = await sql<
    { status: string; role: string; approved: boolean; grade: string; linked: boolean }[]
  >`select status, role, approved, grade, linked, retired_on::text from public.members
    where id = ${id}`;
  return row;
};

const newPenalty = () => ({
  memberId: ids.member,
  reason: '私物の出しっぱなし',
  date: DATE,
  memo: '弓具ケース',
  contents: ['道場の掃除'],
});

describe('権限', () => {
  const adminActions = [
    'admin-close-penalty',
    'admin-approve',
    'admin-update-member',
    'admin-reset-device',
    'admin-delete-member',
    'admin-add-exception',
    'admin-delete-exception',
    'admin-review-notice',
    'admin-save-lineup',
    'admin-delete-lineup',
    'admin-rejudge',
    'admin-set-manual',
    'admin-update-settings',
    'admin-save-rule',
    'admin-delete-rule',
    'admin-save-penalty-type',
    'change-generation',
    'promote-grades',
  ];
  /** 入力の確認を通り、権限の確認まで届く内容 */
  const valid = () => ({
    memberId: ids.member,
    penaltyId: ids.member,
    exceptionId: ids.member,
    ruleId: ids.member,
    date: DATE,
    kind: 'koma4',
    judgement: '',
    approval: 'approved',
    part: 'first',
    format: 'groups',
    groups: [[ids.member]],
    changes: { role: 'captain' },
    settings: {
      allowedDistanceMeters: 150,
      duplicateScanSeconds: 120,
      undoSeconds: 60,
      autoCheckoutTime: '22:00',
      komaLocked: false,
      noticeLeadMinutes: 60,
      penaltyDoublingDays: 7,
    },
    rule: {
      weekday: 3,
      condition: 'all',
      part: 'whole',
      deadline: '09:00',
      startTime: '09:30',
    },
    type: { reason: '試験用の理由', baseCount: 1 },
    retiringGrade: 'B3',
  });

  it.each(adminActions)('%s は副務と部員にはできない', async (action) => {
    for (const who of ['vice', 'member'] as const) {
      expect(await run(who, action, valid())).toEqual({
        ok: false,
        error: 'この操作ができるのは、主将と管理者だけです。',
      });
    }
  });

  it.each(['add-penalty', 'assign-task', 'edit-task', 'complete-task'])(
    '%s は部員にはできない',
    async (action) => {
      const params = { ...newPenalty(), penaltyId: ids.member, taskId: ids.member, content: 'x' };

      expect(await run('member', action, params)).toMatchObject({
        error: containing('副務・主将・管理者だけ'),
      });
    },
  );

  it('休部中の主将は管理できない', async () => {
    await sql`update public.members set status = 'suspended' where id = ${ids.captain}`;

    expect((await run('captain', 'admin-rejudge', { date: DATE })).ok).toBe(false);
  });
});

describe('罰の操作', () => {
  it('副務が罰をつけると、やることも登録される', async () => {
    await must('vice', 'add-penalty', newPenalty());

    expect(await penalties()).toMatchObject([{ reason: '私物の出しっぱなし' }]);
    expect(await tasks()).toMatchObject([{ content: '道場の掃除', done: false }]);
  });

  it('やることの数が基本の数と違えば拒否する', async () => {
    await must('captain', 'admin-save-penalty-type', {
      type: { reason: '私物の出しっぱなし', baseCount: 2 },
    });

    expect(await run('vice', 'add-penalty', newPenalty())).toMatchObject({
      error: containing('罰2個ぶん'),
    });
    expect(await penalties()).toEqual([]);
  });

  it('消化すると罰が消化済みになる', async () => {
    await must('vice', 'add-penalty', newPenalty());
    const [task] = await tasks();

    const result = await must('vice', 'complete-task', { taskId: task!.id });

    expect(await penalties()).toMatchObject([{ completed_on: DATE }]);
    expect(result).toMatchObject({ home: { member: { id: ids.vice } } });
    expect(await run('vice', 'complete-task', { taskId: task!.id })).toMatchObject({
      error: 'すでに消化済みです。',
    });
  });

  it('倍になった分は割り当てられ、すべて消化するまで残る', async () => {
    await must('vice', 'add-penalty', newPenalty());
    const [penalty] = await penalties();
    const later = at('12:00', '2026-12-07');
    const assign = () =>
      run('vice', 'assign-task', { penaltyId: penalty!.id, content: ' 的貼り 3個 ' }, later);

    expect((await assign()).ok).toBe(true);
    expect(await assign()).toMatchObject({ error: 'この罰は、すべて割り当て済みです。' });

    const [first, second] = await tasks();
    await must('vice', 'complete-task', { taskId: first!.id }, later);
    expect(await penalties()).toMatchObject([{ completed_on: null }]);
    await must('vice', 'complete-task', { taskId: second!.id }, later);
    expect(await penalties()).toMatchObject([{ completed_on: '2026-12-07' }]);
  });

  it('同じ罰の2つのやることを同時に消しても、残りが合う', async () => {
    await must('vice', 'add-penalty', newPenalty());
    const [penalty] = await penalties();
    const later = at('12:00', '2026-12-07');
    await must('vice', 'assign-task', { penaltyId: penalty!.id, content: '的貼り' }, later);

    const all = await tasks();
    await Promise.all(all.map((task) => must('vice', 'complete-task', { taskId: task.id }, later)));

    expect(await penalties()).toMatchObject([{ completed_on: '2026-12-07' }]);
  });

  it('割り当てた内容は、消化する前なら直せる', async () => {
    await must('vice', 'add-penalty', newPenalty());
    const [task] = await tasks();

    await must('vice', 'edit-task', { taskId: task!.id, content: '窓の掃除' });

    expect(await tasks()).toMatchObject([{ content: '窓の掃除' }]);
    await must('vice', 'complete-task', { taskId: task!.id });
    expect((await run('vice', 'edit-task', { taskId: task!.id, content: 'x' })).ok).toBe(false);
  });

  it('主将が消化済みにした自動の罰は、判定し直しても変わらない', async () => {
    await must('captain', 'admin-rejudge', { date: DATE }, at('22:15'));
    const before = await penalties();
    await must('captain', 'admin-close-penalty', { penaltyId: before[0]!.id });
    await sql`insert into public.exceptions (date, kind) values (${DATE}, 'day_off')`;

    await must('captain', 'admin-rejudge', { date: DATE }, at('22:20'));

    expect((await penalties()).map((penalty) => penalty.id)).toEqual([before[0]!.id]);
  });
});

describe('名簿の操作', () => {
  it('承認する', async () => {
    const { id } = await insertMember(sql, { approved: false });

    await must('captain', 'admin-approve', { memberId: id });

    expect(await member(id)).toMatchObject({ approved: true });
  });

  it('状態・役職・学年を変える。引退日は今日になる', async () => {
    await must('captain', 'admin-update-member', {
      memberId: ids.member,
      changes: { status: 'retired', role: 'vice', grade: 'M1' },
    });

    expect(await member(ids.member)).toMatchObject({
      status: 'retired',
      role: 'vice',
      grade: 'M1',
      retired_on: DATE,
    });
  });

  it.each([
    ['admin-update-member', { changes: { role: 'member' } }],
    ['admin-update-member', { changes: { status: 'graduated' } }],
    ['admin-reset-device', {}],
  ])('最後の主将は %s で外せない: %o', async (action, params) => {
    const result = await run('captain', action, { memberId: ids.captain, ...params });

    expect(result).toMatchObject({ error: containing('主将がいなくなる') });
    expect(await member(ids.captain)).toMatchObject({
      role: 'captain',
      status: 'active',
      linked: true,
    });
  });

  it('再登録を許可すると端末との結びつきが外れる', async () => {
    await must('captain', 'admin-reset-device', { memberId: ids.member });

    expect(await member(ids.member)).toMatchObject({ linked: false, approved: true });
  });

  it('記録のない登録は、そのまま削除できる', async () => {
    const { id } = await insertMember(sql, { approved: false });
    await sql`insert into public.koma (member_id) values (${id})`;

    await must('captain', 'admin-delete-member', { memberId: id });

    expect(await member(id)).toBeUndefined();
  });

  it('記録がある人は、指定がなければ削除しない', async () => {
    await must('vice', 'add-penalty', newPenalty());

    const result = await run('captain', 'admin-delete-member', { memberId: ids.member });

    expect(result).toMatchObject({ error: containing('記録がある人') });
    expect(await member(ids.member)).toBeDefined();
  });

  it('記録ごと削除する。本人が記録した他人の記録は残る', async () => {
    await must('captain', 'admin-rejudge', { date: DATE }, at('22:15'));
    await sql`insert into public.punches (member_id, punched_at, kind, via)
      values (${ids.vice}, ${at('16:00')}, 'in', 'app')`;
    await must('vice', 'add-penalty', newPenalty());
    await must('captain', 'admin-add-exception', { date: DATE, memberId: ids.vice, kind: 'koma4' });

    await must('captain', 'admin-delete-member', { memberId: ids.vice, deleteRecords: true });

    expect(await member(ids.vice)).toBeUndefined();
    for (const table of ['punches', 'attendance', 'exceptions', 'penalties']) {
      const [row] = await sql`select count(*)::int as n from ${sql(table)}
        where member_id = ${ids.vice}`;
      expect(row?.['n']).toBe(0);
    }
    expect(
      await sql`select created_by from public.penalties where reason = '私物の出しっぱなし'`,
    ).toEqual([{ created_by: null }]);
    expect(await tasks()).toMatchObject([{ content: '道場の掃除' }]);
  });

  it('自分は削除できない', async () => {
    const params = { memberId: ids.captain, deleteRecords: true };

    expect(await run('captain', 'admin-delete-member', params)).toMatchObject({
      error: '自分は削除できません。',
    });
  });
});

describe('臨時変更と出欠一覧', () => {
  const finals = () =>
    sql<{ member_id: string; final_result: string; auto_result: string }[]>`
      select member_id, auto_result, final_result from public.attendance`;

  it('連絡を記録して判定し直すと、罰が外れる', async () => {
    await must('captain', 'admin-rejudge', { date: DATE }, at('22:15'));
    expect(await penalties()).toHaveLength(3);

    await must('captain', 'admin-add-exception', {
      date: DATE,
      memberId: ids.member,
      kind: 'absent_notice',
      contactedAt: '2026-11-30T12:00:00+09:00',
    });
    await must('captain', 'admin-rejudge', { date: DATE }, at('22:20'));

    expect(await penalties()).toHaveLength(2);
  });

  it('追加した臨時変更を削除できる', async () => {
    await must('captain', 'admin-add-exception', { date: DATE, kind: 'day_off' });
    const [row] = await sql<{ id: string }[]>`select id from public.exceptions`;

    await must('captain', 'admin-delete-exception', { exceptionId: row!.id });

    expect(await sql`select 1 from public.exceptions`).toHaveLength(0);
  });

  it('手動判定で罰が外れ、戻すとまたつく。自動判定は変わらない', async () => {
    await must('captain', 'admin-rejudge', { date: DATE }, at('22:15'));
    // コマ表を変えても、手動判定では自動判定を計算し直さない
    await sql`insert into public.koma (member_id, mon5) values (${ids.member}, true)`;
    const manual = (judgement: string, reason: string) =>
      must('captain', 'admin-set-manual', {
        date: DATE,
        memberId: ids.member,
        judgement,
        reason,
      });

    await manual('present', '打刻忘れ');
    expect(await penalties()).toHaveLength(2);
    expect(await finals()).toContainEqual({
      member_id: ids.member,
      auto_result: 'absent_unexcused',
      final_result: 'present',
    });

    await manual('', '');
    expect(await penalties()).toHaveLength(3);
  });

  it('先の日付は判定しない', async () => {
    expect(await run('captain', 'admin-rejudge', { date: '2026-12-07' })).toEqual({
      ok: false,
      error: '先の日付は判定できません。',
    });
  });
});

describe('設定', () => {
  it('設定を変える。入口QRは変わらない', async () => {
    const settings = {
      entranceQr: 'changed',
      dojoLatitude: null,
      dojoLongitude: null,
      allowedDistanceMeters: 150,
      duplicateScanSeconds: 120,
      undoSeconds: 60,
      autoCheckoutTime: '22:00',
      komaLocked: false,
      noticeLeadMinutes: 60,
      penaltyDoublingDays: 10,
    };

    await must('captain', 'admin-update-settings', { settings });

    const rows = await sql`select key, value from public.settings
      where key in ('entranceQr', 'penaltyDoublingDays', 'dojoLatitude') order by key`;
    expect(rows.map((row) => row['value'] as unknown)).toEqual([null, 'LOCAL-TEST-QR', 10]);
  });

  it('練習ルールを追加して置き換え、削除する', async () => {
    const rule = { weekday: 3, condition: 'all', part: 'whole', startTime: '09:30' };
    await must('captain', 'admin-save-rule', { rule: { ...rule, deadline: '09:00' } });
    await must('captain', 'admin-save-rule', { rule: { ...rule, deadline: '08:45' } });

    const rows = await sql<{ id: string; deadline: string }[]>`
      select id, deadline::text from public.practice_rules where weekday = 3`;
    expect(rows).toMatchObject([{ deadline: '08:45:00' }]);

    await must('captain', 'admin-delete-rule', { ruleId: rows[0]!.id });
    expect(await sql`select 1 from public.practice_rules where weekday = 3`).toHaveLength(0);
  });
});

describe('代替わりと学年の繰り上げ', () => {
  it('3年を引退にして、役職を入れ替える', async () => {
    const result = await must('captain', 'change-generation', {
      retiringGrade: 'B3',
      captainNos: studentNos.member,
    });

    expect(result).toMatchObject({ retired: 2 });
    expect(await member(ids.captain)).toMatchObject({ status: 'retired', role: 'member' });
    expect(await member(ids.member)).toMatchObject({ status: 'active', role: 'captain' });
  });

  it('端末のない人だけを主将にする代替わりは取りやめる', async () => {
    const { studentNo } = await insertMember(sql);

    const result = await run('captain', 'change-generation', {
      retiringGrade: 'B3',
      captainNos: studentNo,
    });

    expect(result.ok).toBe(false);
    expect(await member(ids.captain)).toMatchObject({ status: 'active', role: 'captain' });
  });

  it('26: 学年の繰り上げは年度に1回だけ', async () => {
    const april = at('12:00', '2027-04-01');
    await must('captain', 'promote-grades', {}, april);

    expect(await member(ids.member)).toMatchObject({ grade: 'B3' });
    expect(await run('captain', 'promote-grades', {}, april)).toMatchObject({
      error: containing('すでに実行'),
    });
    expect(await member(ids.member)).toMatchObject({ grade: 'B3' });
  });

  it('同時に2回実行しても1回だけ', async () => {
    const april = at('12:00', '2027-04-01');

    const results = await Promise.all([
      run('captain', 'promote-grades', {}, april),
      run('captain', 'promote-grades', {}, april),
    ]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(await member(ids.member)).toMatchObject({ grade: 'B3' });
  });
});
