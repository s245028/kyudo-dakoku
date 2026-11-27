// 通知（Web Push）。通知はロック画面に出るので、理由は入れない
import { dateWithWeekday, type PracticeDate } from './date.ts';
import { invalid, type Validated } from './validation.ts';

/** 通知を押したときに開く画面 */
export const OPEN_TARGETS = ['notices', 'members', 'scan'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

export type PushMessage = { title: string; body: string; open: OpenTarget };

/** 通知の対象。欠席・遅刻の連絡か、コマ変更の申請 */
export type PushSubject = 'absent' | 'late' | 'koma';

const SUBJECT_LABELS: Record<PushSubject, string> = {
  absent: '欠席の連絡',
  late: '遅刻の連絡',
  koma: 'コマ変更の申請',
};

/** 主将と管理者に、届いたことを知らせる */
export function receivedMessage(input: {
  name: string;
  date: PracticeDate;
  subject: PushSubject;
  /** 締め切り後で、承認の対象外 */
  overdue: boolean;
}): PushMessage {
  const { name, date, subject, overdue } = input;
  return {
    title: `${SUBJECT_LABELS[subject]}が届きました`,
    body: `${name}さん・${dateWithWeekday(date)}${overdue ? '（締め切り後）' : ''}`,
    open: 'notices',
  };
}

/** 主将と管理者に、承認を待つ部員の登録を知らせる */
export function registrationMessage(name: string): PushMessage {
  return {
    title: '新しい部員の登録が届きました',
    body: `${name}さん・承認してください`,
    open: 'members',
  };
}

/** 本人に、承認か却下を知らせる */
export function reviewedMessage(input: {
  date: PracticeDate;
  subject: PushSubject;
  approval: 'approved' | 'rejected';
}): PushMessage {
  const { date, subject, approval } = input;
  const result = approval === 'approved' ? '承認' : '却下';
  return {
    title: `${SUBJECT_LABELS[subject]}が${result}されました`,
    body: `${dateWithWeekday(date)}の分です。アプリで確認してください。`,
    open: 'scan',
  };
}

/** ブラウザが使う通知の中継先。ほかの宛先には、サーバーから送らない */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

const isBase64Url = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length <= maxLength && /^[A-Za-z0-9_-]+={0,2}$/.test(value);

/** `https` で、ポートや利用者名のない中継先か。ホスト名のあとはパスが続く形だけを受け付ける */
function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1000) return false;
  const host = /^https:\/\/([a-z0-9.-]+)\/[\x21-\x7e]*$/.exec(value)?.[1];
  return (
    host !== undefined && PUSH_HOSTS.some((known) => host === known || host.endsWith(`.${known}`))
  );
}

/** ブラウザの購読情報（`PushSubscription.toJSON()`）を確かめる。 */
export function validatePushSubscription(
  input: Readonly<Record<string, unknown>>,
): Validated<PushSubscriptionInput> {
  const { endpoint, keys } = input;
  const { p256dh, auth } = (typeof keys === 'object' && keys !== null ? keys : {}) as Record<
    string,
    unknown
  >;
  if (!isPushEndpoint(endpoint) || !isBase64Url(p256dh, 200) || !isBase64Url(auth, 100)) {
    return invalid('この端末の通知は登録できませんでした。');
  }
  return { ok: true, value: { endpoint, p256dh, auth } };
}
