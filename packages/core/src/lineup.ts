// 立ち順。木札のように、列（的や立ち）に部員を並べる
import { GRADES, ROLE_LABELS, type Role } from './member.ts';
import { PARTS, type Part } from './practice.ts';
import type { Participant } from './participants.ts';
import { invalid, type Validated } from './validation.ts';

/** `targets` は平日の的ごと、`groups` は1立ちずつ（土曜・強化練習・選考） */
export const LINEUP_FORMATS = ['targets', 'groups'] as const;
export type LineupFormat = (typeof LINEUP_FORMATS)[number];

export const LINEUP_FORMAT_LABELS: Record<LineupFormat, string> = {
  targets: '的ごと',
  groups: '立ち',
};

/** 的の名前。先頭（大前）が画面の右端 */
export const TARGET_NAMES = [
  '大前',
  '2的',
  '3的',
  '4的',
  '5的',
  '6的',
  '7的',
  '落前',
  '落',
] as const;
export const GROUP_SIZE = 8;
export const MAX_GROUPS = 20;

/** 同じ的や立ちに、2人以上入れないようにする役職の組 */
export const SEPARATED_ROLES: readonly (readonly Role[])[] = [
  ['captain', 'men_vice_captain', 'women_vice_captain', 'chief_manager'],
  ['vice'],
];

/** 列ごとの部員の id。列の中は引く順 */
export type LineupGroups = string[][];

export type Lineup = { format: LineupFormat; groups: LineupGroups; published: boolean };

/** 列の名前。`index` は0始まり */
export function lineupColumnName(format: LineupFormat, index: number): string {
  return format === 'targets' ? (TARGET_NAMES[index] ?? '') : `${index + 1}立ち目`;
}

const separationOf = (role: Role) => {
  const index = SEPARATED_ROLES.findIndex((roles) => roles.includes(role));
  return index === -1 ? null : index;
};

/** 引く順。遅刻者は後ろ、そのあと学年の上の人から */
function compareForOrder(a: Participant, b: Participant): number {
  return (
    Number(a.status === 'late') - Number(b.status === 'late') ||
    GRADES.indexOf(b.person.grade) - GRADES.indexOf(a.person.grade) ||
    a.person.studentNo.localeCompare(b.person.studentNo)
  );
}

/** 並びの優先順位。小さいほうを先に選ぶ */
const smallest = <T>(candidates: readonly T[], keys: (candidate: T) => number[]): T =>
  candidates.reduce((best, candidate) => {
    const a = keys(candidate);
    const b = keys(best);
    const index = a.findIndex((value, at) => value !== b[at]);
    return index !== -1 && a[index]! < b[index]! ? candidate : best;
  });

/**
 * 参加者（欠席を除く）を自動で並べる。
 * 的ごとは9的に均等に、立ちは1立ち8人までで人数をそろえる。
 * 分ける役職の人は別の列にし、遅刻者は列の後ろ（立ちでは後の立ち）にする。
 */
export function arrangeLineup(
  format: LineupFormat,
  participants: readonly Participant[],
): LineupGroups {
  const people = participants.filter((entry) => entry.status !== 'absent');
  const largestSeparated = Math.max(
    0,
    ...SEPARATED_ROLES.map(
      (roles) => people.filter((entry) => roles.includes(entry.person.role)).length,
    ),
  );
  const count =
    format === 'targets'
      ? TARGET_NAMES.length
      : Math.min(MAX_GROUPS, Math.max(1, Math.ceil(people.length / GROUP_SIZE), largestSeparated));
  const columns: Participant[][] = Array.from({ length: count }, () => []);
  const capacity = (index: number) =>
    Math.floor(people.length / count) + (index < people.length % count ? 1 : 0);

  // 置き場所が限られる人（遅刻者、分ける役職の人）から先に置く
  const priority = (entry: Participant) =>
    (format === 'groups' && entry.status === 'late' ? 0 : 2) +
    (separationOf(entry.person.role) === null ? 1 : 0);
  const queue = [...people].sort((a, b) => priority(a) - priority(b) || compareForOrder(a, b));

  for (const entry of queue) {
    const separation = separationOf(entry.person.role);
    const indexes = columns
      .map((_, index) => index)
      .filter((index) => format === 'targets' || columns[index]!.length < GROUP_SIZE);
    const conflicts = (index: number) =>
      separation === null
        ? 0
        : columns[index]!.filter((other) => separationOf(other.person.role) === separation).length;
    const chosen = smallest(indexes.length > 0 ? indexes : [count - 1], (index) => {
      if (format === 'targets') return [conflicts(index), columns[index]!.length, index];
      const full = Number(columns[index]!.length >= capacity(index));
      return entry.status === 'late'
        ? [conflicts(index), full, -index]
        : [conflicts(index), full, columns[index]!.length, index];
    });
    columns[chosen]!.push(entry);
  }
  return columns.map((column) => column.sort(compareForOrder).map((entry) => entry.person.id));
}

/** 分ける役職の人が同じ列にいれば、その注意を返す。手で並べたものは止めない。 */
export function lineupWarnings(
  format: LineupFormat,
  groups: LineupGroups,
  roleOf: (memberId: string) => Role | undefined,
): string[] {
  return groups.flatMap((group, index) =>
    SEPARATED_ROLES.flatMap((roles) => {
      const found = group.flatMap((id) => {
        const role = roleOf(id);
        return role && roles.includes(role) ? [ROLE_LABELS[role]] : [];
      });
      return found.length > 1
        ? [`${lineupColumnName(format, index)}に${found.join('と')}がいます`]
        : [];
    }),
  );
}

/** 2人を入れ替える。片方が列にいなければ、その人が場所を引き継ぎ、もう片方は外れる。 */
export function swapInLineup(groups: LineupGroups, first: string, second: string): LineupGroups {
  return groups.map((group) =>
    group.map((id) => (id === first ? second : id === second ? first : id)),
  );
}

/** 部員を指定した列の最後に移す。`column` が null なら列から外す。移せなければ変えない。 */
export function moveInLineup(
  format: LineupFormat,
  groups: LineupGroups,
  memberId: string,
  column: number | null,
): LineupGroups {
  const removed = groups.map((group) => group.filter((id) => id !== memberId));
  if (column === null) return removed;
  const target = removed[column];
  if (!target || (format === 'groups' && target.length >= GROUP_SIZE)) return groups;
  return removed.map((group, index) => (index === column ? [...group, memberId] : group));
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export type LineupInput = Lineup & { part: Part };

/** 保存する立ち順を確かめる。立ちの空の列は取り除く。 */
export function validateLineup(input: Readonly<Record<string, unknown>>): Validated<LineupInput> {
  const part = PARTS.find((candidate) => candidate === input['part']);
  const format = LINEUP_FORMATS.find((candidate) => candidate === input['format']);
  const raw = input['groups'];
  if (!part || !format || !Array.isArray(raw)) return invalid('立ち順の指定が正しくありません。');

  const columns: unknown[] = raw;
  const groups: LineupGroups = [];
  for (const column of columns) {
    if (!Array.isArray(column) || !column.every(isUuid)) {
      return invalid('立ち順の指定が正しくありません。');
    }
    groups.push(column);
  }
  const kept = format === 'groups' ? groups.filter((group) => group.length > 0) : groups;
  if (format === 'targets' && kept.length !== TARGET_NAMES.length) {
    return invalid(`的は${TARGET_NAMES.length}個です。`);
  }
  if (kept.length > MAX_GROUPS) return invalid(`立ちは${MAX_GROUPS}個までです。`);
  if (format === 'groups' && kept.some((group) => group.length > GROUP_SIZE)) {
    return invalid(`1立ちは${GROUP_SIZE}人までです。`);
  }
  const ids = kept.flat();
  if (ids.length === 0) return invalid('並べる人がいません。');
  if (new Set(ids).size !== ids.length) return invalid('同じ人が2回入っています。');
  return {
    ok: true,
    value: { part, format, groups: kept, published: input['published'] === true },
  };
}
