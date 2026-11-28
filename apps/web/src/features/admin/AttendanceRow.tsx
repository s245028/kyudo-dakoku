import { JUDGEMENT_LABELS, MANUAL_JUDGEMENTS, toClockTime } from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import type { AttendanceEntry } from '../../lib/queries.ts';
import { Options } from './Options.tsx';
import type { RunAction } from '../../lib/useAction.ts';

type AttendanceRowProps = {
  entry: AttendanceEntry & { name: string };
  sending: boolean;
  run: RunAction;
};

const clock = (instant: string | null) => (instant ? toClockTime(new Date(instant)) : '—');

export function AttendanceRow({ entry, sending, run }: AttendanceRowProps) {
  const [open, setOpen] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    if (await run('admin-set-manual', { memberId: entry.memberId, ...input })) setOpen(false);
  }

  return (
    <li className="expandable">
      <button
        type="button"
        className="expand-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          <strong>{entry.name}</strong>
          <small className="sub">
            {entry.deadline.slice(0, 5)}集合・入室 {clock(entry.firstIn)}・退室{' '}
            {clock(entry.lastOut)}
          </small>
        </span>
        {entry.manualResult && <small className="sub manual-mark">手動</small>}
      </button>
      {entry.note && <p className="row-note">{entry.note}</p>}
      {open && (
        <form className="form" onSubmit={(event) => void save(event)}>
          <p className="sub">自動判定：{JUDGEMENT_LABELS[entry.autoResult]}</p>
          <label>
            手動判定
            <select name="judgement" defaultValue={entry.manualResult ?? ''}>
              <option value="">自動判定のまま</option>
              <Options values={MANUAL_JUDGEMENTS} labels={JUDGEMENT_LABELS} />
            </select>
          </label>
          <label>
            修正理由（手動判定のときは必須）
            <input name="reason" defaultValue={entry.manualReason} maxLength={200} />
          </label>
          <button type="submit" disabled={sending}>
            保存
          </button>
        </form>
      )}
    </li>
  );
}
