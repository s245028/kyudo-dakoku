// 的中の記録。区分、入力の確認、保存と訂正の決まり
import { isPracticeDate, type PracticeDate } from './date.ts';
import { isApprovedMember, type Member, type Role } from './member.ts';
import { invalid, type Validated } from './validation.ts';

export const HIT_CATEGORIES = ['standing', 'drill', 'self'] as const;
export type HitCategory = (typeof HIT_CATEGORIES)[number];

export const HIT_CATEGORY_LABELS: Record<HitCategory, string> = {
  standing: '立ち',
  drill: '射込み',
  self: '自練',
};

/** `total` は射数と的中数だけ、`shots` は一射ずつの記録 */
export type HitMode = 'total' | 'shots';

/** 一射。1は中り、0は外れ、null は未入力 */
export type Shot = 0 | 1 | null;
export type ShotRow = Shot[];

export const SHOTS_PER_ROW = 4;
/** 1件に記録できる射数。打ち間違いを止める */
export const HIT_MAX_SHOTS = 200;
const HIT_MAX_ROWS = HIT_MAX_SHOTS / SHOTS_PER_ROW;
/** 1日に引く目標の射数。グラフに線で出すだけで、順位の条件ではない */
export const DAILY_TARGET_SHOTS = 40;
/** 同じ人が続けて直したときに、変更の履歴を1件にまとめる分数 */
export const HIT_HISTORY_MERGE_MINUTES = 5;

export type HitTally = { shots: number; hits: number };

export type HitContent = HitTally &
  ({ mode: 'total'; rows: null } | { mode: 'shots'; rows: ShotRow[] });

export type HitRecord = HitContent & {
  category: HitCategory;
  /** 保存のたびに変わる番号。ほかで変わっていないかを確かめる */
  revision: number;
};

export const emptyRow = (): ShotRow => Array.from({ length: SHOTS_PER_ROW }, () => null);

const SHOT_CYCLE: readonly Shot[] = [null, 1, 0];

/** 欄を押すたびに、未入力 → 中り → 外れ → 未入力 */
export function nextShot(shot: Shot): Shot {
  return SHOT_CYCLE[(SHOT_CYCLE.indexOf(shot) + 1) % SHOT_CYCLE.length]!;
}

/** 入力した射だけを数える */
export function countRows(rows: readonly (readonly Shot[])[]): HitTally {
  const entered = rows.flat().filter((shot) => shot !== null);
  return { shots: entered.length, hits: entered.filter((shot) => shot === 1).length };
}

const isEmptyRow = (row: readonly Shot[]) => row.every((shot) => shot === null);

/** 後ろに続く、何も入れていない段を除く */
export function trimRows(rows: readonly ShotRow[]): ShotRow[] {
  const last = rows.findLastIndex((row) => !isEmptyRow(row));
  return rows.slice(0, last + 1);
}

/**
 * 画面に出す段。最後の段を4射とも入れたら次の段を足し、少なくとも `minimum` 段にする。
 */
export function displayRows(rows: readonly ShotRow[], minimum = 1): ShotRow[] {
  const last = rows.at(-1);
  const full = last !== undefined && last.every((shot) => shot !== null);
  const length = Math.min(HIT_MAX_ROWS, Math.max(minimum, rows.length + (full ? 1 : 0)));
  return Array.from({ length }, (_, index) => rows[index] ?? emptyRow());
}

export function hitRate({ shots, hits }: HitTally): number | null {
  return shots === 0 ? null : hits / shots;
}

/** `57.1%`。引いていなければ `―` */
export function formatHitRate(tally: HitTally): string {
  const rate = hitRate(tally);
  return rate === null ? '―' : `${(rate * 100).toFixed(1)}%`;
}

export function sumTallies(tallies: readonly HitTally[]): HitTally {
  return tallies.reduce(
    (total, tally) => ({ shots: total.shots + tally.shots, hits: total.hits + tally.hits }),
    { shots: 0, hits: 0 },
  );
}

/** 合計で入れる射数と的中数を確かめる */
export function validateTally(shots: unknown, hits: unknown): Validated<HitTally> {
  if (typeof shots !== 'number' || !Number.isInteger(shots) || shots < 1 || shots > HIT_MAX_SHOTS) {
    return invalid(`射数は1〜${HIT_MAX_SHOTS}の整数にしてください。`);
  }
  if (typeof hits !== 'number' || !Number.isInteger(hits) || hits < 0 || hits > shots) {
    return invalid('的中数は、0から射数までの整数にしてください。');
  }
  return { ok: true, value: { shots, hits } };
}

/** 保存の依頼1件。`content` が null なら削除 */
export type HitEntry = {
  category: HitCategory;
  content: HitContent | null;
  /** 直す前に見ていた記録の番号。記録がなかったときは null */
  baseRevision: number | null;
};

const isShot = (value: unknown): value is Shot => value === null || value === 0 || value === 1;

const isRow = (value: unknown): value is ShotRow =>
  Array.isArray(value) && value.length === SHOTS_PER_ROW && value.every(isShot);

function validateContent(input: Readonly<Record<string, unknown>>): Validated<HitContent | null> {
  if (input['delete'] === true) return { ok: true, value: null };
  if (input['mode'] === 'total') {
    const tally = validateTally(input['shots'], input['hits']);
    return tally.ok ? { ok: true, value: { mode: 'total', rows: null, ...tally.value } } : tally;
  }
  const raw = input['rows'];
  if (input['mode'] !== 'shots' || !Array.isArray(raw) || !raw.every(isRow)) {
    return invalid('記録の内容が正しくありません。');
  }
  const rows = trimRows(raw);
  if (rows.length > HIT_MAX_ROWS) return invalid(`射数は${HIT_MAX_SHOTS}までです。`);
  const tally = countRows(rows);
  // 1射も入っていなければ、記録を消す
  return { ok: true, value: tally.shots === 0 ? null : { mode: 'shots', rows, ...tally } };
}

export function validateHitEntry(input: unknown): Validated<HitEntry> {
  if (typeof input !== 'object' || input === null) return invalid('記録の内容が正しくありません。');
  const raw = input as Readonly<Record<string, unknown>>;
  const category = HIT_CATEGORIES.find((candidate) => candidate === raw['category']);
  if (!category) return invalid('区分を選んでください。');
  const base = raw['baseRevision'] ?? null;
  if (base !== null && !(typeof base === 'number' && Number.isInteger(base))) {
    return invalid('記録の内容が正しくありません。');
  }
  const content = validateContent(raw);
  if (!content.ok) return content;
  return { ok: true, value: { category, content: content.value, baseRevision: base } };
}

/** 記録できる日は、開始日から今日まで */
export function validateHitDate(
  date: string,
  { startDate, today }: { startDate: PracticeDate | null; today: PracticeDate },
): Validated<PracticeDate> {
  if (!isPracticeDate(date)) return invalid('日付が正しくありません。');
  if (startDate === null) return invalid('記録の開始日がまだ決まっていません。');
  if (date < startDate) return invalid('記録の開始日より前の分は入れられません。');
  if (date > today) return invalid('先の日の記録は入れられません。');
  return { ok: true, value: date };
}

const sameContent = (a: HitContent, b: HitContent) =>
  a.mode === b.mode &&
  a.shots === b.shots &&
  a.hits === b.hits &&
  JSON.stringify(a.rows) === JSON.stringify(b.rows);

/**
 * 今の記録に、依頼をどう反映するか。ほかで変わっていたら上書きしない（`conflict`）。
 * 同じ内容の送り直し（通信が切れて結果が届かなかったとき）は、何もしない。
 */
export function planHitChange(
  existing: (HitContent & { revision: number }) | null,
  { content, baseRevision }: Pick<HitEntry, 'content' | 'baseRevision'>,
): 'noop' | 'conflict' | 'save' | 'delete' {
  if (content === null && !existing) return 'noop';
  if (content !== null && existing && sameContent(existing, content)) return 'noop';
  if ((existing?.revision ?? null) !== baseRevision) return 'conflict';
  return content === null ? 'delete' : 'save';
}

type WithRole = Pick<Member, 'status' | 'approved'> & { role: Role; isAdmin: boolean };

/** ほかの部員の記録を訂正・削除できるか。副務と管理者。 */
export function canCorrectHits(member: WithRole): boolean {
  return isApprovedMember(member) && (member.role === 'vice' || member.isAdmin);
}

/** 記録を保存できない理由。できるなら null。 */
export function hitEditRefusal(input: {
  own: boolean;
  /** 承認済みで在籍中の部員か（自分の記録をつけられる） */
  actorMayRecord: boolean;
  actorCanCorrect: boolean;
  /** まだない記録を足すか */
  creating: boolean;
}): string | null {
  const { own, actorMayRecord, actorCanCorrect, creating } = input;
  if (own) return actorMayRecord ? null : '承認されるまで、記録できません。';
  if (!actorCanCorrect) return '記録を直せるのは、本人と副務・管理者だけです。';
  return creating ? 'ほかの部員の記録は、訂正と削除だけができます。' : null;
}

/** 直前の履歴にまとめるか。同じ人が短い間に続けて直した分は1件にする。 */
export function mergesIntoHistory(input: {
  latest: { changedBy: string | null; changedAt: Date; hasAfter: boolean } | null;
  actorId: string | null;
  now: Date;
  deleting: boolean;
}): boolean {
  const { latest, actorId, now, deleting } = input;
  if (!latest || deleting || !latest.hasAfter || latest.changedBy !== actorId) return false;
  return now.getTime() - latest.changedAt.getTime() < HIT_HISTORY_MERGE_MINUTES * 60_000;
}

/** 履歴に出す内容。`16射9中`、記録がなければ `なし` */
export function describeTally(tally: HitTally | null): string {
  return tally ? `${tally.shots}射${tally.hits}中` : 'なし';
}
