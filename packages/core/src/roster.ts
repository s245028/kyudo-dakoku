// 名簿の分け方と並べ方
import { GRADES, type Grade, type MemberStatus } from './member.ts';

export const ROSTER_GROUPS = ['active', 'retired', 'other'] as const;
export type RosterGroup = (typeof ROSTER_GROUPS)[number];

export const ROSTER_GROUP_LABELS: Record<RosterGroup, string> = {
  active: '現役',
  retired: '引退',
  other: '休部・卒業',
};

export const rosterGroupOf = (status: MemberStatus): RosterGroup =>
  status === 'active' || status === 'retired' ? status : 'other';

type Sortable = { studentNo: string; grade: Grade };

/** 学年が上の人から。同じ学年は学生番号の順。 */
export function compareRoster(a: Sortable, b: Sortable): number {
  return (
    GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade) || a.studentNo.localeCompare(b.studentNo)
  );
}

/** 空白を除き、全角と半角、大文字と小文字をそろえる */
const searchText = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** 名前か学生番号の一部で探す。空の入力はすべて当てはまる。 */
export function matchesMember(
  member: { name: string; studentNo?: string | undefined },
  query: string,
): boolean {
  const needle = searchText(query);
  if (!needle) return true;
  return [member.name, member.studentNo ?? ''].some((value) => searchText(value).includes(needle));
}

/** 名簿を分けて、それぞれを並べ直す。 */
export function groupRoster<T extends Sortable & { status: MemberStatus }>(
  members: readonly T[],
): Record<RosterGroup, T[]> {
  const sorted = [...members].sort(compareRoster);
  return Object.fromEntries(
    ROSTER_GROUPS.map((group) => [
      group,
      sorted.filter((member) => rosterGroupOf(member.status) === group),
    ]),
  ) as Record<RosterGroup, T[]>;
}
