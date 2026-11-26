import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymousClient,
  clearRecords,
  connect,
  insertMember,
  signInDevice,
  type Device,
} from './helpers.ts';

const sql = connect();
let approved: Device;
let pending: Device;
let memberId: string;

beforeAll(async () => {
  await clearRecords(sql);
  [approved, pending] = await Promise.all([signInDevice(), signInDevice()]);
  memberId = (await insertMember(sql, { auth_user_id: approved.userId })).id;
  await insertMember(sql, { auth_user_id: pending.userId, approved: false });
});

afterAll(async () => {
  await Promise.all([approved, pending].map((device) => device.client.removeAllChannels()));
  await clearRecords(sql);
  await sql.end();
});

/** 在室の通知を購読する。購読できたかと、届いた回数を返す */
async function listen(device: Device) {
  await device.client.realtime.setAuth(device.accessToken);
  const received: unknown[] = [];
  const status = await new Promise<string>((resolve) => {
    device.client
      .channel('presence', { config: { private: true } })
      .on('broadcast', { event: 'changed' }, (message) => received.push(message))
      .subscribe((state) => {
        if (String(state) !== 'CLOSED') resolve(String(state));
      });
  });
  return { status, received };
}

describe('在室一覧の更新通知', () => {
  it('打刻すると、承認済みの部員の画面に届く', async () => {
    const { status, received } = await listen(approved);
    expect(status).toBe('SUBSCRIBED');

    await sql`insert into public.punches (member_id, punched_at, kind, via)
      values (${memberId}, now(), 'in', 'app')`;

    // Realtime は最初の購読のあとに配信の準備を始めるので、届くまで打刻を更新し直す
    await expect
      .poll(
        async () => {
          await sql`update public.punches set distance_m = 0 where member_id = ${memberId}`;
          return received.length;
        },
        { timeout: 15_000, interval: 500 },
      )
      .toBeGreaterThan(0);
  });

  it('承認していない端末は購読できない', async () => {
    expect((await listen(pending)).status).toBe('CHANNEL_ERROR');
  });
});

describe('ping', () => {
  it('ログインなしで呼べて、何も読まない', async () => {
    const response = await anonymousClient().rpc('ping');

    expect(response.data).toBe('ok');
  });
});
