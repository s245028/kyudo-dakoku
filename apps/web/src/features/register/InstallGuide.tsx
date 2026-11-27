/** iPhone のブラウザでは、先にホーム画面に追加してもらう */
export function InstallGuide({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <h2>先にホーム画面に追加してください</h2>
      <p className="notice">
        iPhoneは、ブラウザとホーム画面のアプリで保存場所が別です。このまま登録すると、ホーム画面のアプリでは未登録になります。
      </p>
      <ol className="card steps">
        <li>共有ボタン（□から↑が出た形）を押す</li>
        <li>「ホーム画面に追加」を押す</li>
        <li>ホーム画面にできた「道場打刻」のアイコンから開く</li>
        <li>開いた画面で部員登録する</li>
      </ol>
      <button type="button" className="secondary" onClick={onContinue}>
        ホーム画面に追加せず、このまま使う（通知は使えません）
      </button>
    </>
  );
}
