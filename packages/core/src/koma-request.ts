// 部員がアプリから出す、その日だけのコマ変更（休講・補講）の申請
import { isWithinNoticeLimit, noticeDeadlineOf } from './attendance.ts';
import { addDays, toPracticeDate, weekdayOf, type PracticeDate } from './date.ts';
import { isApprovedMember, isRetiredOn } from './member.ts';
import { NOTICE_DAYS_AHEAD, NOTICE_REASON_MAX_LENGTH, type NoticeContext } from './notice.ts';
import {
  isKomaRequest,
  KOMA_CHANGE_KINDS,
  resolvePracticePlan,
  type KomaChangeKind,
  type NoticeApproval,
  type PlanTime,
} from './practice.ts';
import { invalid } from './validation.ts';

export const KOMA_REQUEST_LABELS: Record<KomaChangeKind, string> = {
  no_koma: '4・5コマなし',
  koma4: '4コマのみ',
  koma5: '5コマあり',
};

export type KomaChoice = PlanTime & { kind: KomaChangeKind };

export type KomaRequest = {
  kind: KomaChangeKind;
  reason: string;
  state: NoticeApproval;
  rejectionReason: string;
};

export type KomaRequestDay = {
  date: PracticeDate;
  /** 申請する前の区分と集合時刻。締め切りはこの集合時刻で決まる */
  base: PlanTime;
  limit: Date;
  /** 選べる変更。今の予定と同じものは出さない */
  choices: KomaChoice[];
  request: KomaRequest | null;
  canSubmit: boolean;
  canCancel: boolean;
};

/** その日の申請の状態。コマで集合時刻が変わらない日や、判定しない日は null。 */
function komaDayOf(context: NoticeContext, date: PracticeDate): KomaRequestDay | null {
  const { member, now, rules, exceptions } = context;
  if (!isApprovedMember(member)) return null;

  const others = exceptions.filter(
    (exception) => !(exception.memberId === member.id && isKomaRequest(exception)),
  );
  const base = resolvePracticePlan({
    ...context,
    memberId: member.id,
    date,
    exceptions: others,
  });
  // 行事の日は全員が同じ時刻なので、コマの申請はない
  if (!base || base.event || base.exempt || (isRetiredOn(member, date) && !base.joined)) {
    return null;
  }

  const weekday = weekdayOf(date);
  const choices = rules.flatMap((rule): KomaChoice[] => {
    const kind = KOMA_CHANGE_KINDS.find((candidate) => candidate === rule.condition);
    const same = rule.part === base.part && rule.deadline === base.deadline;
    return rule.weekday === weekday && kind && !same
      ? [{ kind, part: rule.part, deadline: rule.deadline }]
      : [];
  });
  if (choices.length === 0) return null;

  const mine = exceptions
    .filter((exception) => exception.date === date && exception.memberId === member.id)
    .filter(isKomaRequest)
    .at(-1);
  const limit = noticeDeadlineOf(date, base.deadline, context.settings.noticeLeadMinutes);
  const arrived = date === toPracticeDate(now) && context.enteredToday;
  const open = isWithinNoticeLimit(now, limit) && !arrived;

  return {
    date,
    base: { part: base.part, deadline: base.deadline },
    limit,
    choices,
    request: mine
      ? {
          kind: mine.kind,
          reason: mine.memo,
          state: mine.approval,
          rejectionReason: mine.rejectionReason ?? '',
        }
      : null,
    canSubmit: open,
    canCancel: open && mine !== undefined,
  };
}

/** 今日からの、コマ変更を申請できる練習日（締め切りを過ぎた日も、状態を出すために含める）。 */
export function upcomingKomaDays(context: NoticeContext): KomaRequestDay[] {
  const today = toPracticeDate(context.now);
  return Array.from({ length: NOTICE_DAYS_AHEAD + 1 }, (_, ahead) =>
    komaDayOf(context, addDays(today, ahead)),
  ).filter((day) => day !== null);
}

export type KomaRequestInput = { date: string } & (
  { action: 'submit'; kind: unknown; reason: string } | { action: 'cancel' }
);

export type KomaRequestDecision =
  | { ok: true; change: 'save'; kind: KomaChangeKind; reason: string; base: PlanTime }
  | { ok: true; change: 'remove' | 'none' }
  | { ok: false; message: string };

const CLOSED_MESSAGE = 'コマ変更の申請は締め切りました。主将に直接伝えてください。';

/** 申請を送る・取り消すときの判断。締め切り（変更前の集合の何分前か）を過ぎたら受け付けない。 */
export function decideKomaRequest(
  context: NoticeContext,
  input: KomaRequestInput,
): KomaRequestDecision {
  const day = upcomingKomaDays(context).find((candidate) => candidate.date === input.date);
  if (!day) return invalid('この日はコマ変更を申請できません。画面を開き直してください。');

  if (input.action === 'cancel') {
    if (!day.request) return { ok: true, change: 'none' };
    return day.canCancel ? { ok: true, change: 'remove' } : invalid(CLOSED_MESSAGE);
  }
  if (!day.canSubmit) return invalid(CLOSED_MESSAGE);
  const choice = day.choices.find((candidate) => candidate.kind === input.kind);
  if (!choice) return invalid('変更後の内容を選んでください。');
  const reason = input.reason.trim();
  if (!reason) return invalid('理由を書いてください。');
  if (reason.length > NOTICE_REASON_MAX_LENGTH) {
    return invalid(`理由は${NOTICE_REASON_MAX_LENGTH}文字までにしてください。`);
  }
  return { ok: true, change: 'save', kind: choice.kind, reason, base: day.base };
}
