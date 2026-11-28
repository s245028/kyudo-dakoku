import { EXCEPTION_LABELS, NOTICE_EXCEPTION_KINDS, NOTICE_REASON_MAX_LENGTH } from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { MemberPicker } from '../../components/MemberPicker.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';
import { Options } from './Options.tsx';

/** 電話や LINE で受けた欠席・遅刻の連絡を、本人の代わりに入れる */
export function ProxyNoticeForm({
  members,
  today,
  sending,
  run,
}: {
  members: RosterEntry[];
  today: string;
  sending: boolean;
  run: RunAction;
}) {
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const { contacted, ...input } = Object.fromEntries(new FormData(form));
    setMessage('');
    const ok = await run('admin-add-exception', {
      ...input,
      // 入力は日本時間
      contactedAt: typeof contacted === 'string' && contacted ? `${contacted}:00+09:00` : '',
    });
    if (!ok) return;
    form.reset();
    setMessage('追加しました');
  }

  return (
    <details className="disclosure">
      <summary>代わりに入力（電話や LINE で受けた分）</summary>
      <form className="form" onSubmit={(event) => void submit(event)}>
        <MemberPicker members={members} />
        <label>
          日付
          <input type="date" name="date" defaultValue={today} required />
        </label>
        <label>
          内容
          <select name="kind">
            <Options values={NOTICE_EXCEPTION_KINDS} labels={EXCEPTION_LABELS} />
          </select>
        </label>
        <label>
          連絡を受けた日時（空なら締め切り内の扱い）
          <input type="datetime-local" name="contacted" />
        </label>
        <label>
          理由
          <input name="memo" maxLength={NOTICE_REASON_MAX_LENGTH} />
        </label>
        <button type="submit" disabled={sending}>
          追加する
        </button>
        <p className="form-message" role="status">
          {message}
        </p>
      </form>
    </details>
  );
}
