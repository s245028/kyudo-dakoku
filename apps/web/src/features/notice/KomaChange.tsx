import {
  KOMA_REQUEST_LABELS,
  NOTICE_REASON_MAX_LENGTH,
  toClockTime,
  type KomaRequestDay,
} from '@kyudo/core';
import { useState, type SubmitEvent } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { APPROVAL_LABELS } from '../../lib/noticeLabels.ts';
import type { RunAction } from '../../lib/useAction.ts';

type KomaChangeProps = { day: KomaRequestDay; sending: boolean; run: RunAction };

/** 練習日1日分の、コマ変更の申請と状態 */
export function KomaChange({ day, sending, run }: KomaChangeProps) {
  const [writing, setWriting] = useState(false);
  const { request, date } = day;

  return (
    <>
      {request && (
        <div className="notice-status">
          <p>
            <span>コマ変更：{KOMA_REQUEST_LABELS[request.kind]}</span>
            <span className={`notice-state notice-state-${request.state}`}>
              {APPROVAL_LABELS[request.state]}
            </span>
          </p>
          <p className="sub">理由：{request.reason}</p>
          {request.rejectionReason && <p className="sub">却下の理由：{request.rejectionReason}</p>}
        </div>
      )}
      {!writing && day.canSubmit && (
        <div className="notice-actions">
          <button
            type="button"
            className="small secondary"
            disabled={sending}
            onClick={() => setWriting(true)}
          >
            {request ? 'コマ変更を出し直す' : 'コマ変更を申請'}
          </button>
          {day.canCancel && (
            <ConfirmButton
              label="申請を取り消す"
              className="small secondary"
              disabled={sending}
              onConfirm={() => void run('cancel-koma-change', { date })}
            />
          )}
        </div>
      )}
      {writing && day.canSubmit && (
        <KomaChangeForm
          day={day}
          sending={sending}
          onClose={() => setWriting(false)}
          onSubmit={async (kind, reason) => {
            if (await run('submit-koma-change', { date, kind, reason })) setWriting(false);
          }}
        />
      )}
    </>
  );
}

function KomaChangeForm({
  day,
  sending,
  onSubmit,
  onClose,
}: {
  day: KomaRequestDay;
  sending: boolean;
  onSubmit: (kind: string, reason: string) => unknown;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<string>(day.choices[0]?.kind ?? '');
  const [reason, setReason] = useState('');

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(kind, reason);
  }

  return (
    <form className="form notice-form" onSubmit={submit}>
      <label>
        変更後の内容
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          {day.choices.map((choice) => (
            <option key={choice.kind} value={choice.kind}>
              {KOMA_REQUEST_LABELS[choice.kind]}（{choice.deadline}集合）
            </option>
          ))}
        </select>
      </label>
      <label>
        理由（必須。休講・補講など）
        <textarea
          value={reason}
          maxLength={NOTICE_REASON_MAX_LENGTH}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      <p className="sub">
        締め切りは今の集合（{day.base.deadline}）に合わせて{toClockTime(day.limit)}
        です。承認されるまで、集合時刻は変わりません。
      </p>
      <button type="submit" disabled={sending || !reason.trim()}>
        コマ変更を申請する
      </button>
      <button type="button" className="secondary" onClick={onClose}>
        やめる
      </button>
    </form>
  );
}
