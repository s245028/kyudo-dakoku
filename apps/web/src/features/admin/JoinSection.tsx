import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { MemberPicker } from '../../components/MemberPicker.tsx';
import { dateWithWeekday } from '../../lib/format.ts';
import type { RosterEntry, StoredException } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';

/** 引退した人の、今日以降の参加。本人がアプリで登録するほか、主将が入れられる */
export function JoinSection({
  joins,
  members,
  today,
  sending,
  readOnly,
  run,
}: {
  joins: StoredException[];
  members: RosterEntry[];
  today: string;
  sending: boolean;
  readOnly: boolean;
  run: RunAction;
}) {
  const [message, setMessage] = useState('');
  const retired = members.filter((member) => member.approved && member.status === 'retired');
  const nameOf = (memberId: string | null) =>
    members.find((member) => member.id === memberId)?.name ?? '不明';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage('');
    const input = Object.fromEntries(new FormData(form));
    if (!(await run('admin-add-exception', { ...input, kind: 'join' }))) return;
    form.reset();
    setMessage('追加しました');
  }

  return (
    <>
      <h3>OB・OGの参加</h3>
      <ul className="list">
        {joins.length === 0 && <li className="empty">これからの参加の登録はありません</li>}
        {joins.map((join) => (
          <li className="list-row" key={join.id}>
            <span>
              <strong>
                {dateWithWeekday(join.date)} {nameOf(join.memberId)}
              </strong>
            </span>
            {!readOnly && (
              <ConfirmButton
                label="削除"
                className="small secondary"
                disabled={sending}
                onConfirm={() => void run('admin-delete-exception', { exceptionId: join.id })}
              />
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <details className="disclosure">
          <summary>参加を代わりに登録する</summary>
          <form className="form" onSubmit={(event) => void submit(event)}>
            <MemberPicker label="引退した人" members={retired} />
            <label>
              参加する日
              <input type="date" name="date" defaultValue={today} required />
            </label>
            <button type="submit" disabled={sending}>
              登録する
            </button>
            <p className="form-message" role="status">
              {message}
            </p>
          </form>
        </details>
      )}
    </>
  );
}
