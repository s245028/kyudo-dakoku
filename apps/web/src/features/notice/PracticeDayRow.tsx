import {
  describeEvent,
  PART_LABELS,
  type JoinDay,
  type KomaRequestDay,
  type NoticeDay,
  type NoticeKind,
} from '@kyudo/core';
import { useState } from 'react';
import { dateWithWeekday } from '../../lib/format.ts';
import type { RunAction } from '../../lib/useAction.ts';
import { KomaChange } from './KomaChange.tsx';
import { NoticeActions } from './NoticeActions.tsx';
import { NoticeForm } from './NoticeForm.tsx';
import { NoticeStatus } from './NoticeStatus.tsx';

type PracticeDayRowProps = {
  day: Pick<NoticeDay, 'date' | 'part' | 'deadline' | 'event'>;
  join: JoinDay | undefined;
  notice: NoticeDay | undefined;
  komaDay: KomaRequestDay | undefined;
  sending: boolean;
  run: RunAction;
};

export function PracticeDayRow(props: PracticeDayRowProps) {
  const { day, join, notice, komaDay, sending, run } = props;
  const [writing, setWriting] = useState<NoticeKind | null>(null);
  const { date } = day;
  const sent = notice?.notice ?? null;

  return (
    <li className="day-card">
      <div className="practice-day">
        <span className="practice-date">
          {dateWithWeekday(date)}
          <small>
            {day.event
              ? `${day.event.title}（${describeEvent(day.event)}）`
              : `${day.deadline}集合・${PART_LABELS[day.part]}`}
          </small>
          {day.event?.memo && <small>{day.event.memo}</small>}
        </span>
        {join && (
          <span className={join.joined ? 'join-chip join-chip-on' : 'join-chip'}>
            {join.joined ? '参加予定' : '未登録'}
          </span>
        )}
      </div>
      {sent && <NoticeStatus notice={sent} />}
      {notice && !writing && (
        <NoticeActions
          day={notice}
          sending={sending}
          onWrite={setWriting}
          onCancel={() => void run('cancel-notice', { date })}
        />
      )}
      {notice?.canSubmit && writing && (
        <NoticeForm
          day={notice}
          kind={writing}
          sending={sending}
          onClose={() => setWriting(null)}
          onSubmit={async (reason) => {
            if (await run('submit-notice', { date, kind: writing, reason })) setWriting(null);
          }}
        />
      )}
      {komaDay && <KomaChange day={komaDay} sending={sending} run={run} />}
      {join && !join.joined && join.canJoin && (
        <button type="button" disabled={sending} onClick={() => void run('join', { date })}>
          参加する
        </button>
      )}
      {join?.joined && join.canCancel && (
        <button
          type="button"
          className="link-button"
          disabled={sending}
          onClick={() => void run('unjoin', { date })}
        >
          参加を取り消す
        </button>
      )}
    </li>
  );
}
