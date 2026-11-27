import { GENDER_LABELS, GENDERS, GRADE_LABELS, GRADES } from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import type { Home } from '../../lib/home.ts';
import { AdminLogin } from './AdminLogin.tsx';

/** iPhone の Safari で開いている（ホーム画面のアプリではない） */
function isIosBrowser(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios && !window.matchMedia('(display-mode: standalone)').matches;
}

export function RegisterScreen({ onRegistered }: { onRegistered: (home: Home) => void }) {
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setSending(true);
    setError('');
    try {
      const { home } = await callAction<{ home: Home }>('register', input);
      onRegistered(home);
    } catch (cause) {
      setError(messageOf(cause));
      setSending(false);
    }
  }

  return (
    <>
      <h2>部員登録（初回だけ）</h2>
      {isIosBrowser() && (
        <p className="notice">
          iPhoneの方へ：先にこの画面を共有ボタンから「ホーム画面に追加」し、ホーム画面のアイコンから開き直して登録してください。Safariのまま登録すると、ホーム画面のアプリでは未登録の状態になります。
        </p>
      )}
      <form className="form" onSubmit={(event) => void submit(event)}>
        <label>
          学生番号
          <input
            name="studentNo"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="例：S000000"
            required
          />
        </label>
        <label>
          名前
          <input name="name" autoComplete="name" placeholder="例：島根 太郎" required />
        </label>
        <fieldset className="segmented">
          <legend>性別</legend>
          {GENDERS.map((gender) => (
            <label key={gender}>
              <input type="radio" name="gender" value={gender} required />
              {GENDER_LABELS[gender]}
            </label>
          ))}
        </fieldset>
        <label>
          学年
          <select name="grade">
            {GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {GRADE_LABELS[grade]}
              </option>
            ))}
          </select>
        </label>
        <p className="form-error" role="alert">
          {error}
        </p>
        <button type="submit" disabled={sending}>
          登録する
        </button>
      </form>
      <p className="hint">
        登録したら、続けて授業のコマを入力します。主将が承認すると打刻できるようになります。
      </p>
      <AdminLogin />
    </>
  );
}
