import { NOTICE_KIND_LABELS, type SentNotice } from '@kyudo/core';
import { NOTICE_STATE_LABELS } from '../../lib/noticeLabels.ts';

/** 送った連絡の状態 */
export function NoticeStatus({ notice }: { notice: SentNotice }) {
  return (
    <div className="notice-status">
      <p>
        <span>{NOTICE_KIND_LABELS[notice.kind]}の連絡</span>
        <span className={`notice-state notice-state-${notice.state}`}>
          {NOTICE_STATE_LABELS[notice.state]}
        </span>
      </p>
      {notice.reason && <p className="sub">理由：{notice.reason}</p>}
      {notice.rejectionReason && <p className="sub">却下の理由：{notice.rejectionReason}</p>}
      {!notice.selfSubmitted && <p className="sub">主将が入力した連絡です</p>}
    </div>
  );
}
