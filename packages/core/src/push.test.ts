import { describe, expect, it } from 'vitest';
import {
  PENALTY_WAITING_MESSAGE,
  receivedMessage,
  registrationMessage,
  reviewedMessage,
  validatePushSubscription,
} from './push.ts';
import { MONDAY } from './testing.ts';

describe('通知の文面', () => {
  it('届いた通知は、名前と日付と種類だけ', () => {
    expect(
      receivedMessage({ name: '島根 太郎', date: MONDAY, subject: 'absent', overdue: false }),
    ).toEqual({
      title: '欠席の連絡が届きました',
      body: '島根 太郎さん・11/30（月）',
      open: 'notices',
    });
    expect(
      receivedMessage({ name: 'a', date: MONDAY, subject: 'late', overdue: true }).body,
    ).toContain('締め切り後');
  });

  it('罰の割り当て待ちの通知は、罰の管理を開く。名前も理由も入れない', () => {
    expect(PENALTY_WAITING_MESSAGE).toEqual({
      title: '罰の割り当て待ちが増えました',
      body: '「罰の管理」で、やることを割り当ててください。',
      open: 'penalties',
      tag: 'penalty-waiting',
    });
  });

  it('登録の通知は名簿を、本人への通知は「自分」を開く', () => {
    expect(registrationMessage('a').open).toBe('members');
    expect(reviewedMessage({ date: MONDAY, subject: 'late', approval: 'approved' }).open).toBe(
      'me',
    );
  });

  it('本人には承認か却下を知らせる', () => {
    expect(reviewedMessage({ date: MONDAY, subject: 'koma', approval: 'rejected' }).title).toBe(
      'コマ変更の申請が却下されました',
    );
  });
});

describe('通知の登録', () => {
  const check = (endpoint: string) =>
    validatePushSubscription({ endpoint, keys: { p256dh: 'BPa_x-1', auth: 'abc' } });

  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-by3p.notify.windows.com/w/?token=abc',
  ])('ブラウザの中継先は受け付ける: %s', (endpoint) => {
    expect(check(endpoint).ok).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://example.com/push',
    'https://fcm.googleapis.com.example.com/x',
    'https://evilpush.apple.com.example.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://127.0.0.1/x',
    'https://user@fcm.googleapis.com/x',
    'https://example.com\\@fcm.googleapis.com/x',
    'not a url',
  ])('ほかの宛先は拒否する: %s', (endpoint) => {
    expect(check(endpoint).ok).toBe(false);
  });

  it('鍵がなければ拒否する', () => {
    expect(
      validatePushSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: null }).ok,
    ).toBe(false);
  });
});
