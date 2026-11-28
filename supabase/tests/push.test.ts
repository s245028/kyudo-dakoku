import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PENALTY_WAITING_MESSAGE,
  toInstant,
  type PushMessage,
} from '../../packages/core/src/index.ts';
import { runNightly } from '../functions/_shared/nightly.ts';
import { sendWebPush, type PushSender } from '../functions/_shared/push.ts';
import { runAction } from '../functions/_shared/router.ts';
import { clearRecords, connect, insertMember, signInDevice, type Device } from './helpers.ts';

const sql = connect();
const DATE = '2026-11-30';
const NOW = toInstant(DATE, '12:00');

type Who = 'captain' | 'member' | 'other' | 'vice';
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
  for (const who of ['captain', 'member', 'other', 'vice'] as const) {
    devices[who] = await signInDevice();
    await insertMember(sql, {
      name: who,
      role: who === 'captain' || who === 'vice' ? who : 'member',
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
    expect(await count()).toBe(4);

    await run('member', 'push-unsubscribe', { endpoint: endpointOf('member') });
    expect(await count()).toBe(4);
    await run('other', 'push-unsubscribe', { endpoint: endpointOf('member') });
    expect(await count()).toBe(3);
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
        message: {
          title: '欠席の連絡が届きました',
          body: 'memberさん・11/30（月）',
          open: 'notices',
          badge: 1,
        },
      },
    ]);
    expect(JSON.stringify(sent)).not.toContain('ないしょ');
  });

  it('新しい部員の登録は、主将に届く', async () => {
    const device = await signInDevice();
    await runAction({ sql, userId: device.userId, now: NOW, sendPush: capture }, 'register', {
      studentNo: 'N000001',
      name: '新入 部員',
      gender: 'female',
      grade: 'B1',
    });

    expect(sent).toEqual([
      {
        endpoint: endpointOf('captain'),
        message: {
          title: '新しい部員の登録が届きました',
          body: '新入 部員さん・承認してください',
          open: 'members',
          badge: 1,
        },
      },
    ]);
  });

  it('アイコンの数は承認を待つ連絡と部員の合計で、本人への結果には付けない', async () => {
    await insertMember(sql, { approved: false });
    await run('member', 'submit-notice', notice);
    await run('other', 'submit-notice', notice);
    const [row] = await sql<{ id: string }[]>`select id from public.exceptions limit 1`;
    await run('captain', 'admin-review-notice', { exceptionId: row!.id, approval: 'approved' });

    expect(sent.map((entry) => entry.message.badge)).toEqual([2, 3, undefined]);
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
    expect(await count()).toBe(3);

    await subscribe('captain');
    const failing: PushSender = () => Promise.reject(new Error('network'));
    expect(await run('member', 'submit-notice', notice, failing)).toMatchObject({ ok: true });
    expect(await count()).toBe(4);
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

describe('副務への罰の通知', () => {
  const toVice = (badge: number) => ({
    endpoint: endpointOf('vice'),
    message: { ...PENALTY_WAITING_MESSAGE, badge },
  });

  const nightly = (date: string) => runNightly(sql, toInstant(date, '22:15'), capture);

  const dayOff = (date: string) =>
    sql`insert into public.exceptions (date, kind) values (${date}, 'day_off')`;

  const scanAt = (time: string) =>
    runAction(
      { sql, userId: devices.member.userId, now: toInstant(DATE, time), sendPush: capture },
      'scan',
      { qr: 'LOCAL-TEST-QR' },
    );

  it('遅刻の打刻で副務にだけ届き、数は割り当て待ちの合計', async () => {
    expect(await scanAt('20:00')).toMatchObject({ ok: true });

    expect(sent).toEqual([toVice(1)]);
  });

  it('罰がつかない打刻では届かない', async () => {
    expect(await scanAt('16:00')).toMatchObject({ ok: true });

    expect(sent).toEqual([]);
  });

  it('夜の判定でまとめて1回届き、上4役の倍率をかけた数になる', async () => {
    await nightly(DATE);

    // 主将は2個、ほかの3人は1個ずつ
    expect(sent).toEqual([toVice(5)]);
  });

  it('新しい罰がない夜は届かず、倍になった夜は届く', async () => {
    await nightly(DATE);
    sent = [];

    await dayOff('2026-12-01');
    await nightly('2026-12-01');
    expect(sent).toEqual([]);

    await dayOff('2026-12-07');
    await nightly('2026-12-07');
    expect(sent).toEqual([toVice(10)]);
  });

  it('主将の判定し直しで罰がつけば副務に届き、もう一度では届かない', async () => {
    const rejudge = () =>
      runAction(
        {
          sql,
          userId: devices.captain.userId,
          now: toInstant(DATE, '22:15'),
          sendPush: capture,
        },
        'admin-rejudge',
        { date: DATE },
      );

    expect(await rejudge()).toMatchObject({ ok: true });
    expect(await rejudge()).toMatchObject({ ok: true });

    expect(sent).toEqual([toVice(5)]);
  });

  it('管理者の通知の数には、罰の割り当て待ちも入る', async () => {
    await nightly(DATE);
    await sql`update public.members set is_admin = true where name = 'other'`;
    sent = [];

    expect(await run('member', 'submit-notice', { ...notice, date: '2026-12-01' })).toMatchObject({
      ok: true,
    });

    expect(sent.map((entry) => [entry.endpoint, entry.message.badge]).sort()).toEqual([
      [endpointOf('captain'), 1],
      [endpointOf('other'), 6],
    ]);
  });
});
