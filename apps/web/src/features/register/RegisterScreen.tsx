import { GENDER_LABELS, GENDERS, GRADE_LABELS, GRADES } from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import type { Home } from '../../lib/home.ts';
import { currentBrowser } from '../../lib/browser.ts';
import { AdminLogin } from './AdminLogin.tsx';
import { EmbeddedBrowserGuide } from './EmbeddedBrowserGuide.tsx';
import { InstallGuide } from './InstallGuide.tsx';
import { TransferClaim } from './TransferClaim.tsx';

type RegisterScreenProps = {
  onRegistered: (home: Home) => void;
  /** 引き継ぎ番号で入った */
  onTransferred: (home: Home) => void;
};

export function RegisterScreen({ onRegistered, onTransferred }: RegisterScreenProps) {
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [browser] = useState(currentBrowser);
  /** iPhone のブラウザで、案内を読んだうえで登録する */
  const [continued, setContinued] = useState(false);

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

  if (browser === 'line' || browser === 'in-app') {
    return <EmbeddedBrowserGuide line={browser === 'line'} />;
  }
  if (browser === 'ios-browser' && !continued) {
    return (
      <>
        <InstallGuide onContinue={() => setContinued(true)} />
        <AdminLogin />
      </>
    );
  }

  return (
    <>
      <TransferClaim onTransferred={onTransferred} />
      <h2>部員登録（初回だけ）</h2>
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
