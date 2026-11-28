import {
  KOMA_SCHEDULE_KINDS,
  MEMO_MAX_LENGTH,
  SCHEDULE_KINDS,
  scheduleLabel,
  type ScheduleKind,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { ChoiceRow } from '../../components/ChoiceRow.tsx';
import { MemberPicker } from '../../components/MemberPicker.tsx';
import { EventForm } from './EventForm.tsx';
import type { DirectoryEntry } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';

const CLUB_VIEWS = { rest: '休み', koma: '休講・補講', event: '行事' };

/** `members` を渡すと部員ごと、渡さなければ部全体の予定を足す */
export function ScheduleForm({
  members,
  today,
  earliest,
  sending,
  run,
}: {
  members?: DirectoryEntry[] | undefined;
  today: string;
  /** 指定できるいちばん前の日。過ぎた日も変えられる人は、指定なし */
  earliest: string | undefined;
  sending: boolean;
  run: RunAction;
}) {
  const [view, setView] = useState<keyof typeof CLUB_VIEWS>('rest');
  const [from, setFrom] = useState(today);
  const [message, setMessage] = useState('');
  const forClub = members === undefined;
  // 部全体の予定は、休みと休講・補講を分けて入れる
  const kinds: readonly ScheduleKind[] = !forClub
    ? SCHEDULE_KINDS
    : view === 'rest'
      ? ['day_off']
      : KOMA_SCHEDULE_KINDS;
  const submitLabel = !forClub
    ? '追加する'
    : view === 'rest'
      ? '全員を休みにする'
      : '全員に追加する';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage('');
    const ok = await run('schedule-add', Object.fromEntries(new FormData(form)));
    if (!ok) return;
    form.reset();
    setFrom(today);
    setMessage('追加しました');
  }

  return (
    <>
      {forClub && (
        <ChoiceRow label="予定の種類" options={CLUB_VIEWS} value={view} onChange={setView} />
      )}
      {forClub && view === 'event' ? (
        <EventForm today={today} earliest={earliest} sending={sending} run={run} />
      ) : (
        <form className="form schedule-form" onSubmit={(event) => void submit(event)}>
          {members && <MemberPicker members={members} />}
          <div className="date-range">
            <label>
              開始日
              <input
                type="date"
                name="from"
                value={from}
                min={earliest}
                onChange={(event) => setFrom(event.target.value)}
                required
              />
            </label>
            <label>
              終了日（1日なら空）
              <input type="date" name="to" min={from} />
            </label>
          </div>
          {kinds.length === 1 ? (
            <input type="hidden" name="kind" value={kinds[0]} />
          ) : (
            <label>
              内容
              <select name="kind" key={view}>
                {kinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {scheduleLabel(kind, forClub ? null : 'member')}
                    {!forClub && kind === 'day_off' && '（判定しない）'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            メモ
            <input name="memo" maxLength={MEMO_MAX_LENGTH} />
          </label>
          <button type="submit" disabled={sending}>
            {submitLabel}
          </button>
          <p className="form-message" role="status">
            {message}
          </p>
        </form>
      )}
    </>
  );
}
