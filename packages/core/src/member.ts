import type { PracticeDate } from './date.ts';

export const MEMBER_STATUSES = ['active', 'retired', 'suspended', 'graduated'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const ROLES = ['member', 'captain', 'vice'] as const;
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
  vice: '副務',
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

/** その日を引退後として扱うか。引退日がなければ、引退にした人は常に引退後。 */
export function isRetiredOn(
  member: Pick<Member, 'status' | 'retiredOn'>,
  date: PracticeDate,
): boolean {
  if (member.status !== 'retired') return false;
  return member.retiredOn === null || member.retiredOn <= date;
}
