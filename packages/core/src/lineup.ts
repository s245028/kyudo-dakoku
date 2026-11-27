// 立ち順。木札のように、列（的や立ち）に部員を並べる
import { GRADES, LEADER_ROLES, ROLE_LABELS, type Role } from './member.ts';
import { PARTS, type Part } from './practice.ts';
import type { Participant } from './participants.ts';
import { invalid, type Validated } from './validation.ts';

/** `targets` は平日の的割り、`groups` は1立ちずつ（土曜・強化練習・選考） */
export const LINEUP_FORMATS = ['targets', 'groups'] as const;
export type LineupFormat = (typeof LINEUP_FORMATS)[number];

export const LINEUP_FORMAT_LABELS: Record<LineupFormat, string> = {
  targets: '的割り',
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
/** 1立ちの人数。ふつうは8人まで。人数のきりが悪いときは、9的で9人まで */
export const GROUP_SIZES = [8, 9] as const;
export type GroupSize = (typeof GROUP_SIZES)[number];
export const [GROUP_SIZE, MAX_GROUP_SIZE] = GROUP_SIZES;

/** 並びを直すときの、1立ちの人数。9人の立ちがあれば9人まで */
export function groupSizeOf(groups: LineupGroups): GroupSize {
  return groups.some((group) => group.length > GROUP_SIZE) ? MAX_GROUP_SIZE : GROUP_SIZE;
}

/**
 * 立ちの中の位置の名前。先頭が大前で、何人の立ちでも最後の2人が落前と落。
 * 2人の立ちは大前と落。
 */
export function groupPositionName(index: number, size: number): string {
  if (index === 0) return '大前';
  if (index === size - 1) return '落';
  return index === size - 2 ? '落前' : `${index + 1}的`;
}
export const MAX_GROUPS = 20;

/** 同じ的や立ちに、2人以上入れないようにする役職の組 */
export const SEPARATED_ROLES: readonly (readonly Role[])[] = [LEADER_ROLES, ['vice']];

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
 * 的割りは9的に均等に、立ちは1立ち `groupSize` 人までで人数をそろえる。
 * 分ける役職の人は別の列にし、遅刻者は列の後ろ（立ちでは後の立ち）にする。
 */
export function arrangeLineup(
  format: LineupFormat,
  participants: readonly Participant[],
  groupSize: GroupSize = GROUP_SIZE,
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
      : Math.min(MAX_GROUPS, Math.max(1, Math.ceil(people.length / groupSize), largestSeparated));
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
      .filter((index) => format === 'targets' || columns[index]!.length < groupSize);
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
  groupSize: GroupSize = GROUP_SIZE,
): LineupGroups {
  const removed = groups.map((group) => group.filter((id) => id !== memberId));
  if (column === null) return removed;
  const target = removed[column];
  if (!target || (format === 'groups' && target.length >= groupSize)) return groups;
  return removed.map((group, index) => (index === column ? [...group, memberId] : group));
}

/** 札の上のどこに落としたか。`before` と `after` は、その札の前後の間 */
export type DropSide = 'before' | 'after';

/** 札を落とすか、移す先 */
export type LineupTarget =
  | { type: 'tag'; memberId: string; side?: DropSide | undefined }
  /** 列の最後 */
  | { type: 'column'; index: number }
  /** 入れていない人の置き場 */
  | { type: 'bench' };

/**
 * 札の前後の間に入れられるか。置き場の札の前後と、人数がいっぱいの立ちにほかの列から
 * 入れることはできない。
 */
export function canInsertBeside(
  format: LineupFormat,
  groups: LineupGroups,
  memberId: string,
  beside: string,
  groupSize: GroupSize = GROUP_SIZE,
): boolean {
  const column = groups.find((group) => group.includes(beside));
  if (!column || memberId === beside) return false;
  return format === 'targets' || column.includes(memberId) || column.length < groupSize;
}

/** 札を、ほかの札の前か後ろに入れて、後ろをずらす。 */
function insertBeside(
  groups: LineupGroups,
  memberId: string,
  beside: string,
  side: DropSide,
): LineupGroups {
  const next = groups.map((group) => {
    const rest = group.filter((id) => id !== memberId);
    const at = rest.indexOf(beside);
    if (at === -1) return rest;
    return rest.toSpliced(side === 'before' ? at : at + 1, 0, memberId);
  });
  const unchanged = next.every((group, index) => group.join() === groups[index]!.join());
  return unchanged ? groups : next;
}

/**
 * 札を移した後の並び。札の上なら入れ替え、札の間なら入れて後ろをずらす（入れられなければ入れ替える）。
 * 変わらなければ、渡した並びをそのまま返す。
 */
export function dropInLineup(
  format: LineupFormat,
  groups: LineupGroups,
  memberId: string,
  target: LineupTarget,
  groupSize: GroupSize = GROUP_SIZE,
): LineupGroups {
  const placed = groups.some((group) => group.includes(memberId));
  if (target.type === 'bench') {
    return placed ? moveInLineup(format, groups, memberId, null) : groups;
  }
  if (target.type === 'column') {
    return moveInLineup(format, groups, memberId, target.index, groupSize);
  }
  const { memberId: other, side } = target;
  if (side && canInsertBeside(format, groups, memberId, other, groupSize)) {
    return insertBeside(groups, memberId, other, side);
  }
  const otherPlaced = groups.some((group) => group.includes(other));
  if (other === memberId || (!placed && !otherPlaced)) return groups;
  return swapInLineup(groups, memberId, other);
}

/** 部員が見る、自分の場所。的割りは的の名前、立ちは何立ち目の何番目か。いなければ null。 */
export function describePosition(
  format: LineupFormat,
  groups: LineupGroups,
  memberId: string,
): string | null {
  const column = groups.findIndex((group) => group.includes(memberId));
  if (column === -1) return null;
  const name = lineupColumnName(format, column);
  return format === 'targets' ? name : `${name}の${groups[column]!.indexOf(memberId) + 1}番目`;
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
  if (format === 'groups' && kept.some((group) => group.length > MAX_GROUP_SIZE)) {
    return invalid(`1立ちは${MAX_GROUP_SIZE}人までです。`);
  }
  const ids = kept.flat();
  if (ids.length === 0) return invalid('並べる人がいません。');
  if (new Set(ids).size !== ids.length) return invalid('同じ人が2回入っています。');
  return {
    ok: true,
    value: { part, format, groups: kept, published: input['published'] === true },
  };
}

export const LINEUP_CONFLICT_MESSAGE =
  'ほかの人が先に保存しました。最新の内容を確認してから、保存し直してください。';

/**
 * 編集を始めたあとに、ほかの人が保存か削除をしたか。
 * `base` は編集のもとにした保存の日時、`current` は今の保存の日時。保存がなければ null。
 */
export function isLineupStale(base: string | null, current: string | null): boolean {
  if (base === null || current === null) return base !== current;
  return new Date(base).getTime() !== new Date(current).getTime();
}
