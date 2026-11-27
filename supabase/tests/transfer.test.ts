import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant } from '../../packages/core/src/index.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
const DATE = '2026-11-30';
const at = (time: string) => toInstant(DATE, time);

let old: Device;
let fresh: Device;
let member: { id: string; studentNo: string };

beforeEach(async () => {
  await clearRecords(sql);
  old = await signInDevice();
  fresh = await signInDevice();
  member = await insertMember(sql, { auth_user_id: old.userId });
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

const run = (device: Device, action: string, params: object = {}, now = at('12:00')) =>
  runAction({ sql, userId: device.userId, now }, action, params as Record<string, unknown>);

async function issue(now = at('12:00')): Promise<string> {
  const result = await run(old, 'create-transfer-code', {}, now);
  if (!result.ok) throw new Error(result.error);
  return (result as unknown as { code: string }).code;
}

const claim = (code: string, now = at('12:01'), device = fresh) =>
  run(device, 'claim-transfer', { studentNo: member.studentNo, code }, now);

/** 正しい番号と必ず違う番号 */
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

const failed: unknown = expect.stringContaining('番号が違うか');

describe('引き継ぎ', () => {
  it('41: 番号を使うと登録が移り、承認はそのまま。元の端末は未登録になる', async () => {
    const code = await issue();

    expect(code).toMatch(/^\d{6}$/);
    expect(await claim(code)).toMatchObject({
      ok: true,
      home: { member: { id: member.id, approved: true } },
    });
    const data: unknown = (await old.client.rpc('home')).data;
    expect(data).toEqual({ member: null });
  });

  it('番号は残さず、1回だけ使える', async () => {
    const code = await issue();
    const [stored] = await sql<{ hash: string }[]>`
      select code_hash as hash from public.device_transfers`;
    expect(stored!.hash).not.toContain(code);

    await claim(code);
    const third = await signInDevice();
    expect(await claim(code, at('12:02'), third)).toMatchObject({ ok: false, error: failed });
  });

  it('42: 5回まちがえると、正しい番号も使えない', async () => {
    const code = await issue();
    for (let count = 0; count < 5; count++) {
      expect(await claim(wrong(code))).toMatchObject({ ok: false, error: failed });
    }

    expect(await claim(code)).toMatchObject({ ok: false });
  });

  it('4回まちがえても、正しい番号は使える', async () => {
    const code = await issue();
    for (let count = 0; count < 4; count++) await claim(wrong(code));

    expect(await claim(code)).toMatchObject({ ok: true });
  });

  it('10分を過ぎた番号と、出し直す前の番号は使えない', async () => {
    const first = await issue();
    expect(await claim(first, at('12:10'))).toMatchObject({ ok: false });

    const second = await issue(at('12:20'));
    const third = await issue(at('12:21'));
    if (second !== third) {
      expect(await claim(second, at('12:22'))).toMatchObject({ ok: false });
    }
    expect(await claim(third, at('12:22'))).toMatchObject({ ok: true });
  });

  it('いない学生番号も、同じ文で断る', async () => {
    expect(
      await run(fresh, 'claim-transfer', { studentNo: 'X999999', code: '000000' }),
    ).toMatchObject({ ok: false, error: failed });
  });

  it('未登録の端末は番号を出せず、登録済みの端末は引き継げない', async () => {
    expect(await run(fresh, 'create-transfer-code')).toMatchObject({ ok: false });

    const code = await issue();
    await insertMember(sql, { auth_user_id: fresh.userId });
    expect(await claim(code)).toMatchObject({
      ok: false,
      error: expect.stringContaining('すでに登録') as unknown,
    });
  });

  it('再登録を許可すると、出してある番号は使えなくなる', async () => {
    const code = await issue();
    const manager = await signInDevice();
    await insertMember(sql, { role: 'captain', auth_user_id: manager.userId });
    await run(manager, 'admin-reset-device', { memberId: member.id });

    expect(await claim(code)).toMatchObject({ ok: false });
  });

  it('番号の表は、アプリから読めない', async () => {
    await issue();
    const { error } = await old.client.from('device_transfers').select('*');

    expect(error?.code).toBe('42501');
  });
});
