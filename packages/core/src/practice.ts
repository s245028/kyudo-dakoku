import { weekdayOf, type ClockTime, type PracticeDate } from './date.ts';

export const PARTS = ['first', 'second', 'whole'] as const;
export type Part = (typeof PARTS)[number];

export const PART_LABELS: Record<Part, string> = {
  first: '前半',
  second: '後半',
  whole: '全体',
};

export const RULE_CONDITIONS = ['all', 'no_koma', 'koma4', 'koma5'] as const;
export type RuleCondition = (typeof RULE_CONDITIONS)[number];

export const RULE_CONDITION_LABELS: Record<RuleCondition, string> = {
  all: '全員',
  no_koma: '4・5コマなし',
  koma4: '4コマあり',
  koma5: '5コマあり',
};

export const EXCEPTION_KINDS = [
  'day_off',
  'no_koma',
  'koma4',
  'koma5',
  'absent_notice',
  'late_notice',
  'join',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  day_off: '休み',
  no_koma: '4・5コマなし',
  koma4: '4コマあり',
  koma5: '5コマあり',
  absent_notice: '欠席連絡済',
  late_notice: '遅刻連絡済',
  join: '参加',
};

export const NOTICE_APPROVALS = ['pending', 'approved', 'rejected'] as const;
export type NoticeApproval = (typeof NOTICE_APPROVALS)[number];

export type PracticeRule = {
  /** 0=日曜 … 6=土曜 */
  weekday: number;
  condition: RuleCondition;
  part: Part;
  /** 集合時刻。これを過ぎた入室は遅刻 */
  deadline: ClockTime;
  startTime: ClockTime;
};

export const KOMA_KEYS = ['mon4', 'mon5', 'tue4', 'tue5', 'thu4', 'thu5'] as const;
export type KomaKey = (typeof KOMA_KEYS)[number];
export type Koma = Record<KomaKey, boolean>;

export const KOMA_LABELS: Record<KomaKey, string> = {
  mon4: '月4',
  mon5: '月5',
  tue4: '火4',
  tue5: '火5',
  thu4: '木4',
  thu5: '木5',
};

/** コマ表がある曜日。ほかの曜日はコマの授業なしとして扱う。 */
const KOMA_BY_WEEKDAY: Partial<Record<number, { fourth: KomaKey; fifth: KomaKey }>> = {
  1: { fourth: 'mon4', fifth: 'mon5' },
  2: { fourth: 'tue4', fifth: 'tue5' },
  4: { fourth: 'thu4', fifth: 'thu5' },
};

export const KOMA_CHANGE_KINDS = ['no_koma', 'koma4', 'koma5'] as const;
export type KomaChangeKind = (typeof KOMA_CHANGE_KINDS)[number];

/** その日の区分と集合時刻 */
export type PlanTime = { part: Part; deadline: ClockTime };

export type PracticeException = {
  date: PracticeDate;
  /** null は全員 */
  memberId: string | null;
  kind: ExceptionKind;
  memo: string;
  /** 主将へ連絡があった日時（欠席・遅刻の連絡） */
  contactedAt: Date | null;
  /**
   * 承認の状態。アプリから締め切りまでに出した連絡と、コマ変更の申請が持つ。
   * 主将の入力と、締め切り後の連絡は null
   */
  approval?: NoticeApproval | null;
  /** 却下した理由 */
  rejectionReason?: string;
  /** 本人がアプリから出した */
  selfSubmitted?: boolean;
  /** コマ変更を申請したときの、変更前の区分と集合時刻 */
  basePlan?: PlanTime | null;
};

export type Notice = Pick<PracticeException, 'contactedAt' | 'approval'>;

export type PracticePlan = {
  part: Part;
  deadline: ClockTime;
  startTime: ClockTime;
  /** 個人の「休み」。判定は「対象外」になる */
  exempt: boolean;
  absentNotice: Notice | null;
  lateNotice: Notice | null;
  joined: boolean;
  /** コマ変更の申請が承認待ち */
  komaRequestPending: boolean;
  notes: string[];
};

type KomaException = PracticeException & { kind: KomaChangeKind };

function isKomaException(exception: PracticeException): exception is KomaException {
  return KOMA_CHANGE_KINDS.some((kind) => kind === exception.kind);
}

export type KomaRequestException = KomaException & { approval: NoticeApproval };

/** 部員がアプリから申請したコマ変更。主将が入力した臨時変更は承認の状態を持たない。 */
export function isKomaRequest(exception: PracticeException): exception is KomaRequestException {
  return isKomaException(exception) && Boolean(exception.approval);
}

/** コマ表に臨時変更を重ねて、その日に使うルールの条件を決める。 */
function komaConditionOf(
  weekday: number,
  koma: Koma | null,
  changes: KomaException[],
): RuleCondition {
  const keys = KOMA_BY_WEEKDAY[weekday];
  let fourth = keys !== undefined && koma?.[keys.fourth] === true;
  let fifth = keys !== undefined && koma?.[keys.fifth] === true;

  // 「4・5コマなし」を先に適用し、そのあと「あり」を適用する
  if (changes.some((change) => change.kind === 'no_koma')) {
    fourth = false;
    fifth = false;
  }
  if (changes.some((change) => change.kind === 'koma4')) fourth = true;
  if (changes.some((change) => change.kind === 'koma5')) fifth = true;

  if (fifth) return 'koma5';
  return fourth ? 'koma4' : 'no_koma';
}

/** 判定に使う連絡。却下した連絡は使わず、承認待ちより確定した連絡を優先する。 */
function effectiveNotice(
  mine: readonly PracticeException[],
  kind: 'absent_notice' | 'late_notice',
): PracticeException | null {
  const notices = mine.filter(
    (exception) => exception.kind === kind && exception.approval !== 'rejected',
  );
  return notices.find((notice) => notice.approval !== 'pending') ?? notices[0] ?? null;
}

/** その日のその人の区分と集合時刻を決める。練習日でなければ null。 */
export function resolvePracticePlan(input: {
  date: PracticeDate;
  memberId: string;
  rules: readonly PracticeRule[];
  koma: Koma | null;
  exceptions: readonly PracticeException[];
}): PracticePlan | null {
  const { date, memberId, koma } = input;
  const weekday = weekdayOf(date);
  const rules = input.rules.filter((rule) => rule.weekday === weekday);
  if (rules.length === 0) return null;

  const today = input.exceptions.filter((exception) => exception.date === date);
  const everyone = today.filter((exception) => exception.memberId === null);
  if (everyone.some((exception) => exception.kind === 'day_off')) return null;

  const mine = today.filter((exception) => exception.memberId === memberId);
  const requests = mine.filter(isKomaRequest);
  const approved = requests.findLast((request) => request.approval === 'approved');
  const notes: string[] = [];
  let rule = rules.find((candidate) => candidate.condition === 'all');

  if (!rule) {
    if (!koma) notes.push('コマ表未登録');
    const changes = [...everyone, ...mine]
      .filter(isKomaException)
      .filter((change) => !change.approval);
    if (changes.length > 0 || approved) notes.push('臨時変更あり');
    // 承認した申請は、コマ表と主将の入力より優先する
    const condition = approved?.kind ?? komaConditionOf(weekday, koma, changes);
    rule = rules.find((candidate) => candidate.condition === condition);
  }
  if (!rule) return null;

  for (const exception of mine) {
    if (!exception.memo) continue;
    const rejected = exception.approval === 'rejected' ? '（却下）' : '';
    notes.push(`${EXCEPTION_LABELS[exception.kind]}${rejected}：${exception.memo}`);
  }

  return {
    part: rule.part,
    deadline: rule.deadline,
    startTime: rule.startTime,
    exempt: mine.some((exception) => exception.kind === 'day_off'),
    absentNotice: effectiveNotice(mine, 'absent_notice'),
    lateNotice: effectiveNotice(mine, 'late_notice'),
    joined: mine.some((exception) => exception.kind === 'join'),
    komaRequestPending: requests.some((request) => request.approval === 'pending'),
    notes,
  };
}
