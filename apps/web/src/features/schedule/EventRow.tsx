import { describeEvent } from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { dateWithWeekday } from '../../lib/format.ts';
import type { StoredEvent } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';
import { EventForm } from './EventForm.tsx';

/** 一覧の行事1件。「変更」を押すと、すぐ下で直す */
export function EventRow({
  stored,
  today,
  sending,
  run,
}: {
  stored: StoredEvent;
  today: string;
  sending: boolean;
  run: RunAction;
}) {
  const [editing, setEditing] = useState(false);
  const { id, date, event } = stored;

  return (
    <li className="rule-item">
      <div className="list-row">
        <span>
          <strong>
            {dateWithWeekday(date)} {event.title}
          </strong>
          <small className="sub">{describeEvent(event)}</small>
          {event.memo && <small className="sub">{event.memo}</small>}
        </span>
        <span className="row-actions">
          <button
            type="button"
            className="small secondary"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? '閉じる' : '変更'}
          </button>
          <ConfirmButton
            label="削除"
            className="small secondary"
            disabled={sending}
            onConfirm={() => void run('schedule-delete', { ids: [id] })}
          />
        </span>
      </div>
      {editing && (
        <EventForm
          saved={stored}
          today={today}
          earliest={undefined}
          sending={sending}
          run={async (name, params) => {
            const ok = await run(name, params);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      )}
    </li>
  );
}
