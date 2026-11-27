import { useEffect, useState } from 'react';
import { messageOf } from '../../lib/api.ts';
import {
  disablePush,
  enablePush,
  loadPushPublicKey,
  pushStatus,
  type PushStatus,
} from '../../lib/push.ts';

const GUIDES: Record<PushStatus, string> = {
  unsupported: 'この端末やブラウザでは、通知を使えません。',
  'needs-install':
    'iPhone は、共有ボタンから「ホーム画面に追加」し、追加したアイコンから開くと通知を使えます。',
  blocked: '通知が許可されていません。端末の設定で、このアプリの通知を許可してください。',
  off: '',
  on: 'この端末で通知を受け取ります。',
};

/** この端末で通知を受け取る設定。`description` は何が届くか */
export function NotificationCard({ description }: { description: string }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [publicKey, setPublicKey] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    async function load() {
      const next = await pushStatus();
      const key = next === 'off' || next === 'on' ? await loadPushPublicKey() : '';
      if (stale) return;
      setStatus(next);
      setPublicKey(key);
    }
    load().catch((cause: unknown) => {
      if (!stale) setError(messageOf(cause));
    });
    return () => {
      stale = true;
    };
  }, []);

  async function change(next: () => Promise<PushStatus>) {
    setSending(true);
    setError('');
    try {
      setStatus(await next());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card notification-card">
      <h3>通知</h3>
      <p className="sub">{description}理由は通知に表示しません。</p>
      {status && GUIDES[status] && <p className="sub">{GUIDES[status]}</p>}
      <p className="form-error" role="alert">
        {error}
      </p>
      {status === 'off' && publicKey && (
        <button
          type="button"
          disabled={sending}
          onClick={() => void change(() => enablePush(publicKey))}
        >
          通知を受け取る
        </button>
      )}
      {status === 'on' && (
        <button
          type="button"
          className="secondary"
          disabled={sending}
          onClick={() => void change(disablePush)}
        >
          通知を止める
        </button>
      )}
    </section>
  );
}
