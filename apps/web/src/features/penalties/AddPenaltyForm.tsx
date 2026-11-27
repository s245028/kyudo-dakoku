import type { PenaltyType } from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import type { RosterEntry } from '../../lib/queries.ts';
import type { PenaltyOperations } from './operations.ts';

type AddPenaltyFormProps = {
  members: RosterEntry[];
  types: PenaltyType[];
  today: string;
  operations: PenaltyOperations;
};

/** 私物の出しっぱなしなど、副務・主将がつける罰 */
export function AddPenaltyForm({ members, types, today, operations }: AddPenaltyFormProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [contents, setContents] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const type = types.find((candidate) => candidate.reason === reason) ?? types[0];
  const count = type?.baseCount ?? 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    setMessage('');
    const ok = await operations.run('add-penalty', {
      ...input,
      reason: type?.reason,
      contents: contents.slice(0, count),
    });
    if (ok) {
      form.reset();
      setContents([]);
      setMessage('記録しました');
    }
  }

  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(!open)}>
        {open ? '閉じる' : '＋ 罰をつける'}
      </button>
      {open && (
        <form className="form add-penalty" onSubmit={(event) => void submit(event)}>
          <label>
            部員
            <select name="memberId" required defaultValue="">
              <option value="" disabled>
                選んでください
              </option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}（{member.studentNo}）
                </option>
              ))}
            </select>
          </label>
          <label>
            理由
            <select value={type?.reason ?? ''} onChange={(event) => setReason(event.target.value)}>
              {types.map((candidate) => (
                <option key={candidate.reason}>{candidate.reason}</option>
              ))}
            </select>
          </label>
          <label>
            日付
            <input type="date" name="date" defaultValue={today} required />
          </label>
          <fieldset className="field-group">
            <legend>やること（罰1個ごと）</legend>
            {Array.from({ length: count }, (_, index) => (
              <input
                key={index}
                aria-label={`${index + 1}個目のやること`}
                value={contents[index] ?? ''}
                maxLength={60}
                list="task-suggestions"
                placeholder="例：道場の掃除"
                required
                onChange={(event) => {
                  const next = Array.from({ length: count }, (_, i) => contents[i] ?? '');
                  next[index] = event.target.value;
                  setContents(next);
                }}
              />
            ))}
          </fieldset>
          <label>
            メモ（何を置きっぱなしにしたか など）
            <textarea name="memo" maxLength={200} />
          </label>
          <button type="submit" disabled={operations.sending}>
            罰をつける
          </button>
          <p className="form-message" role="status">
            {message}
          </p>
        </form>
      )}
    </>
  );
}
