import type { PracticeDate } from './date.ts';

export const MEMBER_STATUSES = ['active', 'retired', 'suspended', 'graduated'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * 役職は1人1つ。会計の権限は部員と同じ。
 * アプリを管理する「管理者」は役職とは別の指定（`isAdmin`）で、どの役職にも重ねられる。
 */
export const ROLES = [
  'member',
  'captain',
  'men_vice_captain',
  'women_vice_captain',
  'chief_manager',
  'vice',
  'treasurer',
] as const;
export type Role = (typeof ROLES)[number];

export const GRADES = ['B1', 'B2', 'B3', 'B4', 'M1', 'M2'] as const;
export type Grade = (typeof GRADES)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const STATUS_LABELS: Record<MemberStatus, string> = {
  active: '現役',
  retired: '引退',
  suspended: '休部・退部',
  graduated: '卒業',
};

export const ROLE_LABELS: Record<Role, string> = {
  member: '部員',
  captain: '主将',
  men_vice_captain: '男子副将',
  women_vice_captain: '女子副将',
  chief_manager: '主務',
  vice: '副務',
  treasurer: '会計',
};

export const ADMIN_LABEL = '管理者';

export const GRADE_LABELS: Record<Grade, string> = {
  B1: '1年',
  B2: '2年',
  B3: '3年',
  B4: '4年',
  M1: '院1年',
  M2: '院2年',
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: '男',
  female: '女',
};

export type Member = {
  id: string;
  status: MemberStatus;
  approved: boolean;
  retiredOn: PracticeDate | null;
};

/** 在籍中（現役・引退）か。休部・退部と卒業の人は打刻も判定もしない。 */
export function isEnrolled(status: MemberStatus): boolean {
  return status === 'active' || status === 'retired';
}

/** 判定・打刻・管理の対象になる部員（承認済みで在籍中）か。 */
export function isApprovedMember(member: Pick<Member, 'status' | 'approved'>): boolean {
  return member.approved && isEnrolled(member.status);
}

type WithRole = Pick<Member, 'status' | 'approved'> & { role: Role; isAdmin: boolean };

/** 部の中心の4役。立ち順を作れ、立ち順では互いに別の列にする */
export const LEADER_ROLES: readonly Role[] = [
  'captain',
  'men_vice_captain',
  'women_vice_captain',
  'chief_manager',
];

/** 画面に出す役職の名前。役職のない部員は空、管理者は後ろに足す */
export function roleLabels(member: Pick<WithRole, 'role' | 'isAdmin'>): string[] {
  return [
    ...(member.role === 'member' ? [] : [ROLE_LABELS[member.role]]),
    ...(member.isAdmin ? [ADMIN_LABEL] : []),
  ];
}

/** 承認・名簿・判定・設定などを操作できるか。主将と管理者。 */
export function canAdminister(member: WithRole): boolean {
  return isApprovedMember(member) && (member.role === 'captain' || member.isAdmin);
}

/** 立ち順を作り、部全体と部員ごとの予定を変えられるか。4役と管理者。 */
export function canEditLineups(member: WithRole): boolean {
  return canAdminister(member) || (isApprovedMember(member) && LEADER_ROLES.includes(member.role));
}

const STATS_ROLES: readonly Role[] = ['vice', 'men_vice_captain', 'women_vice_captain'];

/** 部全体の集計を見られるか。主将・副務・男子副将・女子副将・管理者。 */
export function canViewStats(member: WithRole): boolean {
  return canAdminister(member) || (isApprovedMember(member) && STATS_ROLES.includes(member.role));
}

/** 役職の画面の項目。並びは、項目の一覧に出す順 */
export const OFFICER_SECTIONS = [
  'notices',
  'lineup',
  'attendance',
  'penalties',
  'clubSchedule',
  'memberSchedule',
  'roster',
  'stats',
  'export',
  'practiceTimes',
  'appSettings',
  'yearly',
] as const;
export type OfficerSection = (typeof OFFICER_SECTIONS)[number];

/** その人の役職の画面に出す項目。空なら、役職の画面そのものを出さない。 */
export function officerSections(member: WithRole): OfficerSection[] {
  const penalties = canManagePenalties(member);
  if (canAdminister(member)) {
    // 罰は、主将は扱わない
    return OFFICER_SECTIONS.filter((section) => section !== 'penalties' || penalties);
  }
  const vice = isApprovedMember(member) && member.role === 'vice';
  const allowed: Partial<Record<OfficerSection, boolean>> = {
    // 副務は、出欠の連絡を見るだけ
    notices: vice,
    penalties,
    lineup: canEditLineups(member),
    clubSchedule: canEditLineups(member),
    memberSchedule: canEditLineups(member),
    stats: canViewStats(member),
    // 張り出す順位は、集計を見られる人が出せる。データの書き出しは主将と管理者だけ
    export: canViewStats(member),
  };
  return OFFICER_SECTIONS.filter((section) => allowed[section]);
}

/** 罰をつける・割り当てる・消化する・取り消すことができるか。主将はできない。 */
export function canManagePenalties(member: WithRole): boolean {
  return isApprovedMember(member) && (member.role === 'vice' || member.isAdmin);
}

/** 対応を待っているものの数。承認待ちの連絡と部員、やることを割り当てていない罰 */
export type WaitingCounts = { notices: number; members: number; tasks: number };

/** その人が対応する分の合計。3本線の赤丸とアイコンの数字に出す。 */
export function waitingCount(member: WithRole, counts: WaitingCounts): number {
  const approvals = canAdminister(member) ? counts.notices + counts.members : 0;
  return approvals + (canManagePenalties(member) ? counts.tasks : 0);
}

/** 管理できる人が1人は残るか。いなくなると、アプリから誰も管理できなくなる。 */
export function hasActingManager(members: readonly WithRole[]): boolean {
  return members.some(canAdminister);
}

/**
 * 管理者の指定を付け外しすることと、管理者の部員を変えることは、管理者だけができる。
 * できない理由を返す。できるなら null。
 */
export function adminOnlyRefusal(input: {
  actorIsAdmin: boolean;
  targetIsAdmin: boolean;
  /** 管理者の指定を変えるときの、変更後の値 */
  nextIsAdmin?: boolean | undefined;
}): string | null {
  const { actorIsAdmin, targetIsAdmin, nextIsAdmin } = input;
  if (actorIsAdmin || (!targetIsAdmin && nextIsAdmin !== true)) return null;
  return '管理者の指定と、管理者の部員の変更は、管理者だけができます。';
}

/** その日を引退後として扱うか。引退日がなければ、引退にした人は常に引退後。 */
export function isRetiredOn(
  member: Pick<Member, 'status' | 'retiredOn'>,
  date: PracticeDate,
): boolean {
  if (member.status !== 'retired') return false;
  return member.retiredOn === null || member.retiredOn <= date;
}
