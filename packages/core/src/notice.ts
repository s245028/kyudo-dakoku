// 部員がアプリから出す欠席・遅刻の連絡と、主将の承認
import { isWithinNoticeLimit, noticeDeadlineOf } from './attendance.ts';
import { addDays, toPracticeDate, type ClockTime, type PracticeDate } from './date.ts';
import { JOIN_DAYS_AHEAD } from './join.ts';
import { isApprovedMember, isRetiredOn, type Member } from './member.ts';
import {
  resolvePracticePlan,
  type Koma,
  type NoticeApproval,
  type Part,
  type PracticeException,
  type PracticeRule,
} from './practice.ts';
import type { PracticeEvent } from './event.ts';
import type { Settings } from './settings.ts';
import { invalid, type Validated } from './validation.ts';

/** 今日から先の、連絡を出せる日数。引退した人の参加登録とそろえる */
export const NOTICE_DAYS_AHEAD = JOIN_DAYS_AHEAD;
export const NOTICE_REASON_MAX_LENGTH = 200;

export const NOTICE_KINDS = ['absent_notice', 'late_notice'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export const NOTICE_KIND_LABELS: Record<NoticeKind, string> = {
  absent_notice: '欠席',
  late_notice: '遅刻',
};

/** 画面に出す連絡の状態。`overdue` は締め切り後の連絡（連絡遅れ） */
export type NoticeState = NoticeApproval | 'overdue';

export type SentNotice = {
  kind: NoticeKind;
  reason: string;
  state: NoticeState;
  rejectionReason: string;
  /** 本人がアプリから出した。主将が入力した連絡は、本人は変えられない */
  selfSubmitted: boolean;
};

export type NoticeDay = {
  date: PracticeDate;
  part: Part;
  deadline: ClockTime;
  /** これを過ぎた連絡は連絡遅れ */
  limit: Date;
  notice: SentNotice | null;
  canSubmit: boolean;
  canCancel: boolean;
  /** いま送ると連絡遅れになる */
  overdueNow: boolean;
  /** 行事の日なら、その内容 */
  event: PracticeEvent | null;
};

export type NoticeContext = {
  member: Pick<Member, 'id' | 'status' | 'approved' | 'retiredOn'>;
  now: Date;
  rules: readonly PracticeRule[];
  koma: Koma | null;
  /** 今日から連絡を出せる最後の日までの臨時変更 */
  exceptions: readonly PracticeException[];
  settings: Pick<Settings, 'noticeLeadMinutes'>;
  /** 今日、入室を記録している */
  enteredToday: boolean;
};

type OwnNotice = PracticeException & { kind: NoticeKind };

const isNoticeKind = (value: unknown): value is NoticeKind =>
  NOTICE_KINDS.some((kind) => kind === value);

function describeNotice(notice: OwnNotice, limit: Date): SentNotice {
  const overdue = notice.contactedAt !== null && !isWithinNoticeLimit(notice.contactedAt, limit);
  const approval = notice.approval ?? 'approved';
  return {
    kind: notice.kind,
    reason: notice.memo,
    state: approval !== 'rejected' && overdue ? 'overdue' : approval,
    rejectionReason: notice.rejectionReason ?? '',
    selfSubmitted: notice.selfSubmitted === true,
  };
}

/** その日の連絡の状態。連絡の対象でない日（練習がない、休み、参加しない引退者）は null。 */
function noticeDayOf(context: NoticeContext, date: PracticeDate): NoticeDay | null {
  const { member, now, exceptions } = context;
  if (!isApprovedMember(member)) return null;
  const plan = resolvePracticePlan({ ...context, memberId: member.id, date });
  if (!plan || plan.exempt || (isRetiredOn(member, date) && !plan.joined)) return null;

  const limit = noticeDeadlineOf(date, plan.deadline, context.settings.noticeLeadMinutes);
  const mine = exceptions.filter(
    (exception): exception is OwnNotice =>
      exception.date === date && exception.memberId === member.id && isNoticeKind(exception.kind),
  );
  // 主将が入力した連絡があれば、それを出す
  const current = mine.find((notice) => !notice.selfSubmitted) ?? mine.at(-1);
  const notice = current ? describeNotice(current, limit) : null;
  const overdueNow = !isWithinNoticeLimit(now, limit);
  const arrived = date === toPracticeDate(now) && context.enteredToday;
  const editable = !notice || (notice.selfSubmitted && !overdueNow);

  return {
    event: plan.event,
    date,
    part: plan.part,
    deadline: plan.deadline,
    limit,
    notice,
    canSubmit: editable && !arrived,
    canCancel: notice !== null && editable,
    overdueNow,
  };
}

/** 今日からの、連絡の対象になる練習日。 */
export function upcomingNoticeDays(context: NoticeContext): NoticeDay[] {
  const today = toPracticeDate(context.now);
  return Array.from({ length: NOTICE_DAYS_AHEAD + 1 }, (_, ahead) =>
    noticeDayOf(context, addDays(today, ahead)),
  ).filter((day) => day !== null);
}

export type NoticeRequest = { date: string } & (
  { action: 'submit'; kind: unknown; reason: string } | { action: 'cancel' }
);

export type NoticeDecision =
  | { ok: true; change: 'save'; kind: NoticeKind; reason: string; approval: 'pending' | null }
  | { ok: true; change: 'remove' | 'none' }
  | { ok: false; message: string };

/** 送れない・取り消せない理由 */
function noticeRefusal(day: NoticeDay): string {
  if (day.notice && !day.notice.selfSubmitted) {
    return '主将が入力した連絡があります。変えるときは主将に伝えてください。';
  }
  if (day.notice && day.overdueNow) {
    return '締め切りを過ぎたので、変更や取り消しはできません。主将に伝えてください。';
  }
  return '入室の記録があるので、今日の連絡はできません。';
}

/**
 * 連絡を送る・取り消すときの判断。締め切り内の連絡は承認待ちになる。
 * 締め切り後も受け付けるが、承認の対象にせず連絡遅れになる。
 */
export function decideNotice(context: NoticeContext, request: NoticeRequest): NoticeDecision {
  const day = upcomingNoticeDays(context).find((candidate) => candidate.date === request.date);
  if (!day) return invalid('この日は連絡の対象ではありません。画面を開き直してください。');

  if (request.action === 'cancel') {
    if (!day.notice) return { ok: true, change: 'none' };
    return day.canCancel ? { ok: true, change: 'remove' } : invalid(noticeRefusal(day));
  }
  if (!day.canSubmit) return invalid(noticeRefusal(day));
  const { kind } = request;
  if (!isNoticeKind(kind)) return invalid('欠席か遅刻を選んでください。');
  const reason = request.reason.trim();
  if (!reason) return invalid('理由を書いてください。');
  if (reason.length > NOTICE_REASON_MAX_LENGTH) {
    return invalid(`理由は${NOTICE_REASON_MAX_LENGTH}文字までにしてください。`);
  }
  return { ok: true, change: 'save', kind, reason, approval: day.overdueNow ? null : 'pending' };
}

export type NoticeReview = { approval: 'approved' | 'rejected'; rejectionReason: string };

/** 主将の承認・却下の入力。却下の理由は任意。 */
export function validateNoticeReview(
  input: Readonly<Record<string, unknown>>,
): Validated<NoticeReview> {
  const approval = input['approval'];
  if (approval !== 'approved' && approval !== 'rejected') {
    return invalid('承認か却下を選んでください。');
  }
  const raw = input['rejectionReason'];
  const rejectionReason =
    approval === 'rejected' && typeof raw === 'string'
      ? raw.trim().slice(0, NOTICE_REASON_MAX_LENGTH)
      : '';
  return { ok: true, value: { approval, rejectionReason } };
}
