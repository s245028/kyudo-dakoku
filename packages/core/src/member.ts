import type { PracticeDate } from './date.ts';

export const MEMBER_STATUSES = ['active', 'retired', 'suspended', 'graduated'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * 男子副将・女子副将・主務・会計の権限は部員と同じ。
 * `admin`（管理者）は、役員ではなくアプリを管理する人。付け外しは管理者だけができる。
 */
export const ROLES = [
  'member',
  'captain',
  'men_vice_captain',
  'women_vice_captain',
  'chief_manager',
  'vice',
  'treasurer',
  'admin',
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
  admin: '管理者',
};

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

type WithRole = Pick<Member, 'status' | 'approved'> & { role: Role };

/** 承認・名簿・臨時変更・判定・設定などを操作できるか。 */
export function canAdminister(member: WithRole): boolean {
  return isApprovedMember(member) && (member.role === 'captain' || member.role === 'admin');
}

/** 罰をつける・割り当てる・消化する・取り消すことができるか。主将はできない。 */
export function canManagePenalties(member: WithRole): boolean {
  return isApprovedMember(member) && (member.role === 'vice' || member.role === 'admin');
}

/** 管理できる人が1人は残るか。いなくなると、アプリから誰も管理できなくなる。 */
export function hasActingManager(members: readonly WithRole[]): boolean {
  return members.some(canAdminister);
}

/**
 * 管理者の役職を付け外しすることと、管理者の部員を変えることは、管理者だけができる。
 * できない理由を返す。できるなら null。
 */
export function adminOnlyRefusal(input: {
  actorIsAdmin: boolean;
  targetRole: Role;
  nextRole?: Role | undefined;
}): string | null {
  const { actorIsAdmin, targetRole, nextRole } = input;
  if (actorIsAdmin || (targetRole !== 'admin' && nextRole !== 'admin')) return null;
  return '管理者の役職の付け外しと、管理者の部員の変更は、管理者だけができます。';
}

/** その日を引退後として扱うか。引退日がなければ、引退にした人は常に引退後。 */
export function isRetiredOn(
  member: Pick<Member, 'status' | 'retiredOn'>,
  date: PracticeDate,
): boolean {
  if (member.status !== 'retired') return false;
  return member.retiredOn === null || member.retiredOn <= date;
}
