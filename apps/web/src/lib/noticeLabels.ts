// 欠席・遅刻の連絡の、画面に出す言葉
import type { NoticeApproval, NoticeState } from '@kyudo/core';

export const APPROVAL_LABELS: Record<NoticeApproval, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

export const NOTICE_STATE_LABELS: Record<NoticeState, string> = {
  ...APPROVAL_LABELS,
  overdue: '締め切り後（連絡遅れ）',
};
