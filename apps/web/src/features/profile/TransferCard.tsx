import { toClockTime, TRANSFER_TTL_MINUTES } from '@kyudo/core';
import { useState } from 'react';
import { useAction } from '../../lib/useAction.ts';

type Issued = { code: string; expiresAt: string };

/** この登録を、別の端末やブラウザに移すための番号を出す */
export function TransferCard() {
  const [issued, setIssued] = useState<Issued | null>(null);
  const action = useAction();
  const issue = () => action.run<Issued>('create-transfer-code', {}, setIssued);

  return (
    <section className="card transfer-card">
      <h3>別の端末・ブラウザに引き継ぐ</h3>
      <p className="sub">
        機種を変えるときや、ホーム画面のアプリに移るときに使います。引き継ぐと、この画面は未登録に戻ります。
      </p>
      {issued && (
        <>
          <p className="transfer-code">{issued.code}</p>
          <p className="sub">
            {toClockTime(new Date(issued.expiresAt))}
            まで（{TRANSFER_TTL_MINUTES}
            分間）、1回だけ使えます。移し先でアプリを開き、「登録済みの人はこちら」に学生番号とこの番号を入力してください。番号は他の人に教えないでください。
          </p>
        </>
      )}
      <p className="form-error" role="alert">
        {action.error}
      </p>
      <button
        type="button"
        className="secondary"
        disabled={action.sending}
        onClick={() => void issue()}
      >
        {issued ? '番号を出し直す' : '引き継ぎ番号を出す'}
      </button>
    </section>
  );
}
