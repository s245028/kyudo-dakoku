import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toInstant, type PushMessage } from '../../packages/core/src/index.ts';
import { sendWebPush, type PushSender } from '../functions/_shared/push.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
const DATE = '2026-11-30';
const NOW = toInstant(DATE, '12:00');

type Who = 'captain' | 'member' | 'other';
const devices = {} as Record<Who, Device>;

const endpointOf = (who: Who) => `https://fcm.googleapis.com/fcm/send/${who}`;

/** ブラウザが作る形の購読情報 */
function subscription(who: Who) {
  const keys = createECDH('prime256v1');
  keys.generateKeys();
  return {
    endpoint: endpointOf(who),
    keys: {
      p256dh: keys.getPublicKey('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
}

let sent: { endpoint: string; message: PushMessage }[] = [];
let status = 201;
const capture: PushSender = (_, target, payload) => {
  sent.push({ endpoint: target.endpoint, message: JSON.parse(payload) as PushMessage });
  return Promise.resolve(status);
};

const run = (who: Who, action: string, params: object = {}, sendPush: PushSender = capture) =>
  runAction(
    { sql, userId: devices[who].userId, now: NOW, sendPush },
    action,
    params as Record<string, unknown>,
  );

const subscribe = (who: Who) => run(who, 'push-subscribe', { subscription: subscription(who) });

const notice = { date: DATE, kind: 'absent_notice', reason: 'ないしょの事情' };

const count = async () => {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.push_subscriptions`;
  return row!.count;
};

beforeEach(async () => {
  await clearRecords(sql);
  sent = [];
  status = 201;
  for (const who of ['captain', 'member', 'other'] as const) {
    devices[who] = await signInDevice();
    await insertMember(sql, {
      name: who,
      role: who === 'captain' ? 'captain' : 'member',
      auth_user_id: devices[who].userId,
    });
    await subscribe(who);
  }
});

afterAll(async () => {
  await clearRecords(sql);
  await sql.end();
});

describe('通知の登録', () => {
  it('公開鍵は毎回同じで、秘密鍵は返さない', async () => {
    const first = await run('member', 'push-config');
    const second = await run('captain', 'push-config');

    expect(first).toEqual(second);
    expect(Object.keys(first).sort()).toEqual(['ok', 'publicKey']);
  });

  it('アプリから鍵と購読の表は読めない', async () => {
    for (const table of ['push_keys', 'push_subscriptions']) {
      const { error } = await devices.captain.client.from(table).select('*');
      expect(error?.code).toBe('42501');
    }
  });

  it('同じ端末は届け先が移り、解除は本人の分だけ', async () => {
    await run('other', 'push-subscribe', { subscription: subscription('member') });
    expect(await count()).toBe(3);

    await run('member', 'push-unsubscribe', { endpoint: endpointOf('member') });
    expect(await count()).toBe(3);
    await run('other', 'push-unsubscribe', { endpoint: endpointOf('member') });
    expect(await count()).toBe(2);
  });

  it('未登録の端末と、中継先でない宛先は拒否する', async () => {
    const stranger = await signInDevice();
    const result = await runAction({ sql, userId: stranger.userId, now: NOW }, 'push-subscribe', {
      subscription: subscription('member'),
    });

    expect(result.ok).toBe(false);
    expect(
      await run('member', 'push-subscribe', {
        subscription: { ...subscription('member'), endpoint: 'https://example.com/x' },
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('送る通知', () => {
  it('連絡は主将にだけ届き、理由は入らない', async () => {
    await run('member', 'submit-notice', notice);

    expect(sent).toEqual([
      {
        endpoint: endpointOf('captain'),
        message: { title: '欠席の連絡が届きました', body: 'memberさん・11/30（月）' },
      },
    ]);
    expect(JSON.stringify(sent)).not.toContain('ないしょ');
  });

  it('主将が自分で出した連絡は、自分には届かない', async () => {
    await run('captain', 'submit-notice', notice);

    expect(sent).toEqual([]);
  });

  it('コマ変更の申請と、承認・却下が届く', async () => {
    await sql`insert into public.koma (member_id, mon5)
      select id, true from public.members where name = 'member'`;
    await run('member', 'submit-koma-change', { date: DATE, kind: 'no_koma', reason: '休講' });
    const [row] = await sql<{ id: string }[]>`select id from public.exceptions`;
    await run('captain', 'admin-review-notice', { exceptionId: row!.id, approval: 'approved' });

    expect(sent.map((entry) => [entry.endpoint, entry.message.title])).toEqual([
      [endpointOf('captain'), 'コマ変更の申請が届きました'],
      [endpointOf('member'), 'コマ変更の申請が承認されました'],
    ]);
  });

  it('なくなった購読は消し、送れなくても操作は成功する', async () => {
    status = 410;
    expect(await run('member', 'submit-notice', notice)).toMatchObject({ ok: true });
    expect(await count()).toBe(2);

    await subscribe('captain');
    const failing: PushSender = () => Promise.reject(new Error('network'));
    expect(await run('member', 'submit-notice', notice, failing)).toMatchObject({ ok: true });
    expect(await count()).toBe(3);
  });

  it('実際の送信は、鍵の署名と暗号化した本文をつける', async () => {
    const requests: { url: string; headers: Headers; length: number }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push({
        url: request.url,
        headers: request.headers,
        length: (await request.arrayBuffer()).byteLength,
      });
      return new Response(null, { status: 201 });
    };
    try {
      const keys = await sql<{ publicKey: string; privateKey: string }[]>`
        select public_key as "publicKey", private_key as "privateKey" from public.push_keys`;
      const config = keys[0] ?? (await import('web-push')).default.generateVAPIDKeys();
      const target = subscription('member');
      const code = await sendWebPush(
        config,
        { endpoint: target.endpoint, ...target.keys },
        JSON.stringify({ title: 't', body: 'ないしょ' }),
      );

      expect(code).toBe(201);
      expect(requests[0]!.url).toBe(target.endpoint);
      expect(requests[0]!.headers.get('authorization')).toMatch(/^vapid t=/);
      expect(requests[0]!.headers.get('content-encoding')).toBe('aes128gcm');
      expect(requests[0]!.length).toBeGreaterThan(80);
    } finally {
      globalThis.fetch = original;
    }
  });
});
