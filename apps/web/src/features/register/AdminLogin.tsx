import { useState, type FormEvent } from 'react';
import { logInAsAdmin } from '../../lib/adminAuth.ts';
import { messageOf } from '../../lib/api.ts';

/** 開発用の管理者ログイン */
export function AdminLogin() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = input.get(key);
      return typeof value === 'string' ? value : '';
    };
    setSending(true);
    setError('');
    try {
      await logInAsAdmin(read('email').trim(), read('password'));
    } catch (cause) {
      setError(messageOf(cause));
      setSending(false);
    }
  }

  return (
    <div className="admin-login">
      <button type="button" className="link-button" onClick={() => setOpen(!open)}>
        管理者ログイン
      </button>
      {open && (
        <form className="form" onSubmit={(event) => void submit(event)}>
          <label>
            メールアドレス
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            パスワード
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="submit" disabled={sending}>
            ログインする
          </button>
        </form>
      )}
    </div>
  );
}
