import { useState } from 'react';
import { externalBrowserUrl } from '../../lib/browser.ts';

/** LINE などの中のブラウザでは登録させず、いつものブラウザへ案内する */
export function EmbeddedBrowserGuide({ line }: { line: boolean }) {
  const [message, setMessage] = useState('');
  const appName = line ? 'LINE' : 'アプリ';

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/`);
      setMessage('URLをコピーしました。いつものブラウザに貼り付けて開いてください。');
    } catch {
      setMessage(`コピーできませんでした。開くURL：${location.origin}/`);
    }
  }

  return (
    <>
      <h2>{appName}の中では登録できません</h2>
      <p className="notice">
        {appName}
        の中で開いた画面は、いつものブラウザやホーム画面のアプリと保存場所が別です。ここで登録すると、あとで未登録の状態になります。
      </p>
      {line && (
        <a className="button-link" href={externalBrowserUrl(location.href)}>
          いつものブラウザで開く
        </a>
      )}
      <p className="hint">
        {line && '開かないときは、'}
        画面の右上か右下のメニューから「ブラウザで開く」を選んでください。
      </p>
      <button type="button" className="secondary" onClick={() => void copy()}>
        URLをコピーする
      </button>
      <p className="form-message" role="status">
        {message}
      </p>
    </>
  );
}
