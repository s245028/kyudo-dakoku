import {
  NOTICE_KIND_LABELS,
  NOTICE_REASON_MAX_LENGTH,
  toClockTime,
  type NoticeDay,
  type NoticeKind,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { dateWithWeekday } from '../../lib/format.ts';

type NoticeFormProps = {
  day: NoticeDay;
  kind: NoticeKind;
  sending: boolean;
  onSubmit: (reason: string) => unknown;
  onClose: () => void;
};

export function NoticeForm({ day, kind, sending, onSubmit, onClose }: NoticeFormProps) {
  const [reason, setReason] = useState('');
  const label = NOTICE_KIND_LABELS[kind];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(reason);
  }

  return (
    <form className="form notice-form" onSubmit={submit}>
      <label>
        {label}の理由（必須）
        <textarea
          value={reason}
          maxLength={NOTICE_REASON_MAX_LENGTH}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {day.overdueNow ? (
        <p className="form-error">
          締め切り（{toClockTime(day.limit)}）を過ぎています。「{label}
          （連絡遅れ）」になり、罰がつきます。送ったあとは取り消せません。
        </p>
      ) : (
        <p className="sub">
          締め切りは{dateWithWeekday(day.date)} {toClockTime(day.limit)}
          です。主将が承認するまで「承認待ち」になります。
        </p>
      )}
      <button type="submit" disabled={sending || !reason.trim()}>
        {day.overdueNow ? '連絡遅れとして送る' : `${label}の連絡を送る`}
      </button>
      <button type="button" className="secondary" onClick={onClose}>
        やめる
      </button>
    </form>
  );
}
