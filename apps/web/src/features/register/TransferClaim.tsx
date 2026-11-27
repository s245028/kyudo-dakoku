import { TRANSFER_CODE_DIGITS } from '@kyudo/core';
import { useState, type SubmitEvent } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import type { Home } from '../../lib/home.ts';

/** 登録済みの人が、引き継ぎ番号でこの端末に移る */
export function TransferClaim({ onTransferred }: { onTransferred: (home: Home) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setSending(true);
    setError('');
    try {
      const { home } = await callAction<{ home: Home }>('claim-transfer', input);
      onTransferred(home);
    } catch (cause) {
      setError(messageOf(cause));
      setSending(false);
    }
  }

  return (
    <div className="transfer-claim">
      <button
        type="button"
        className="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        登録済みの人はこちら
      </button>
      {open && (
        <form className="form" onSubmit={(event) => void submit(event)}>
          <p className="sub">
            登録済みの画面の「自分」タブで「引き継ぎ番号を出す」を押し、表示された番号を入力してください。登録済みの画面を開けないときは、主将に連絡してください。
          </p>
          <label>
            学生番号
            <input
              name="studentNo"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </label>
          <label>
            引き継ぎ番号（{TRANSFER_CODE_DIGITS}桁）
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="submit" disabled={sending}>
            引き継ぐ
          </button>
        </form>
      )}
    </div>
  );
}
