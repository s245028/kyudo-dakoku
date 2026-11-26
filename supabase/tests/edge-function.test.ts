// Edge Function を実際に呼び、Deno で動くこととログインの確認を調べる
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { clearRecords, connect, signInDevice } from './helpers.ts';

const sql = connect();
beforeAll(() => clearRecords(sql));
afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

async function call(body: object, token?: string) {
  const { apiUrl, publishableKey } = inject('stack');
  const response = await fetch(`${apiUrl}/functions/v1/api`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as object };
}

describe('api', () => {
  it('ログインした端末は登録できる', async () => {
    const device = await signInDevice();
    const input = { studentNo: 'E0001', name: '関数 太郎', gender: 'male', grade: 'B1' };

    const result = await call({ action: 'register', ...input }, device.accessToken);

    expect(result).toMatchObject({
      status: 200,
      body: { ok: true, home: { member: { studentNo: 'E0001' } } },
    });
  });

  it.each([undefined, 'invalid.token.value', 'publishable'])(
    'ログインしていなければ拒否する: %s',
    async (kind) => {
      const token = kind === 'publishable' ? inject('stack').publishableKey : kind;

      expect((await call({ action: 'scan' }, token)).status).toBe(401);
    },
  );
});
