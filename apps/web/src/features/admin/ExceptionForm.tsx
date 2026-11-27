import {
  EVERYONE_EXCEPTION_KINDS,
  EXCEPTION_KINDS,
  EXCEPTION_LABELS,
  NOTICE_EXCEPTION_KINDS,
  type ExceptionKind,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import type { RosterEntry } from '../../lib/queries.ts';
import { Options } from './Options.tsx';
import type { RunAction } from '../../lib/useAction.ts';

type ExceptionFormProps = {
  members: RosterEntry[];
  today: string;
  sending: boolean;
  run: RunAction;
};

export function ExceptionForm({ members, today, sending, run }: ExceptionFormProps) {
  const [memberId, setMemberId] = useState('');
  const [selected, setSelected] = useState<ExceptionKind>('day_off');
  const kinds = memberId ? EXCEPTION_KINDS : EVERYONE_EXCEPTION_KINDS;
  const kind = kinds.includes(selected) ? selected : 'day_off';
  const isNotice = NOTICE_EXCEPTION_KINDS.includes(kind);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    const contacted = input['contacted'];
    const ok = await run('admin-add-exception', {
      date: input['date'],
      memberId: memberId || null,
      kind,
      memo: input['memo'],
      // 入力は日本時間
      contactedAt: typeof contacted === 'string' && contacted ? `${contacted}:00+09:00` : '',
    });
    if (ok) form.reset();
  }

  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <label>
        日付
        <input type="date" name="date" defaultValue={today} required />
      </label>
      <label>
        対象
        <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">全員</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}（{member.studentNo}）
            </option>
          ))}
        </select>
      </label>
      <label>
        内容
        <select value={kind} onChange={(event) => setSelected(event.target.value as ExceptionKind)}>
          <Options values={kinds} labels={EXCEPTION_LABELS} />
        </select>
      </label>
      {isNotice && (
        <label>
          連絡を受けた日時（空なら締め切り内の扱い）
          <input type="datetime-local" name="contacted" />
        </label>
      )}
      <label>
        メモ
        <input name="memo" maxLength={200} />
      </label>
      <button type="submit" disabled={sending}>
        追加する
      </button>
    </form>
  );
}
