import {
  NOTICE_KIND_LABELS,
  PART_LABELS,
  type JoinDay,
  type NoticeDay,
  type NoticeKind,
  type Part,
} from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { dateWithWeekday } from '../../lib/format.ts';
import type { RunAction } from '../../lib/useAction.ts';
import { NoticeForm } from './NoticeForm.tsx';
import { NoticeStatus } from './NoticeStatus.tsx';

type PracticeDayRowProps = {
  day: { date: string; part: Part; deadline: string };
  join: JoinDay | undefined;
  notice: NoticeDay | undefined;
  sending: boolean;
  run: RunAction;
};

export function PracticeDayRow({ day, join, notice, sending, run }: PracticeDayRowProps) {
  const [writing, setWriting] = useState<NoticeKind | null>(null);
  const { date } = day;
  const sent = notice?.notice ?? null;

  return (
    <li>
      <div className="practice-day">
        <span className="practice-date">
          {dateWithWeekday(date)}
          <small>
            {day.deadline}集合・{PART_LABELS[day.part]}
          </small>
        </span>
        {join && (
          <span className="row-actions">
            {join.joined && <span className="join-status">参加予定</span>}
            {join.joined && join.canCancel && (
              <button
                type="button"
                className="small secondary"
                disabled={sending}
                onClick={() => void run('unjoin', { date })}
              >
                取消
              </button>
            )}
            {!join.joined && join.canJoin && (
              <button
                type="button"
                className="small"
                disabled={sending}
                onClick={() => void run('join', { date })}
              >
                参加する
              </button>
            )}
          </span>
        )}
      </div>
      {sent && <NoticeStatus notice={sent} />}
      {notice && !writing && (notice.canSubmit || notice.canCancel) && (
        <div className="notice-actions">
          {notice.canSubmit &&
            (Object.keys(NOTICE_KIND_LABELS) as NoticeKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className="small secondary"
                disabled={sending}
                onClick={() => setWriting(kind)}
              >
                {sent ? `${NOTICE_KIND_LABELS[kind]}で出し直す` : `${NOTICE_KIND_LABELS[kind]}する`}
              </button>
            ))}
          {notice.canCancel && (
            <ConfirmButton
              label="連絡を取り消す"
              className="small secondary"
              disabled={sending}
              onConfirm={() => void run('cancel-notice', { date })}
            />
          )}
        </div>
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
    </li>
  );
}
