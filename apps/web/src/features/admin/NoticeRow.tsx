import {
  NOTICE_KIND_LABELS,
  NOTICE_REASON_MAX_LENGTH,
  type NoticeKind,
  toClockTime,
  toPracticeDate,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { dateWithWeekday, shortDate } from '../../lib/format.ts';
import { APPROVAL_LABELS } from '../../lib/noticeLabels.ts';
import type { StoredException } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';

/** 承認の対象でない連絡の説明 */
function untargetedLabel(notice: StoredException): string {
  return notice.selfSubmitted ? '締め切り後（連絡遅れ）' : '主将の入力';
}

function contactText(contactedAt: string): string {
  const at = new Date(contactedAt);
  return `連絡 ${shortDate(toPracticeDate(at))} ${toClockTime(at)}`;
}

type NoticeRowProps = {
  notice: StoredException;
  name: string;
  sending: boolean;
  run: RunAction;
};

export function NoticeRow({ notice, name, sending, run }: NoticeRowProps) {
  const [rejecting, setRejecting] = useState(false);
  const { approval } = notice;
  const review = (decision: 'approved' | 'rejected', rejectionReason = '') =>
    run('admin-review-notice', {
      exceptionId: notice.id,
      approval: decision,
      rejectionReason,
    });

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('rejectionReason');
    if (await review('rejected', typeof reason === 'string' ? reason : '')) setRejecting(false);
  }

  return (
    <li className="notice-row">
      <p className="notice-row-title">
        <strong>
          {dateWithWeekday(notice.date)} {name}
        </strong>
        <span className={`notice-state notice-state-${approval ?? 'none'}`}>
          {approval ? APPROVAL_LABELS[approval] : untargetedLabel(notice)}
        </span>
      </p>
      <p className="sub">
        {NOTICE_KIND_LABELS[notice.kind as NoticeKind]}
        {notice.contactedAt && `・${contactText(notice.contactedAt)}`}
      </p>
      {notice.memo && <p className="notice-reason">{notice.memo}</p>}
      {notice.rejectionReason && <p className="sub">却下の理由：{notice.rejectionReason}</p>}
      {approval && !rejecting && (
        <div className="notice-actions">
          {approval !== 'approved' && (
            <button
              type="button"
              className="small"
              disabled={sending}
              onClick={() => void review('approved')}
            >
              承認する
            </button>
          )}
          {approval !== 'rejected' && (
            <button
              type="button"
              className="small secondary"
              disabled={sending}
              onClick={() => setRejecting(true)}
            >
              却下する
            </button>
          )}
        </div>
      )}
      {rejecting && (
        <form className="form notice-form" onSubmit={(event) => void reject(event)}>
          <label>
            却下の理由（任意。本人に表示します）
            <input name="rejectionReason" maxLength={NOTICE_REASON_MAX_LENGTH} />
          </label>
          <button type="submit" className="danger" disabled={sending}>
            却下を確定する
          </button>
          <button type="button" className="secondary" onClick={() => setRejecting(false)}>
            やめる
          </button>
        </form>
      )}
    </li>
  );
}
