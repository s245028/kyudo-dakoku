// DB の行を packages/core の型に読み込む
import {
  addDays,
  DEFAULT_SETTINGS,
  NOTICE_DAYS_AHEAD,
  toPracticeDate,
  type Grade,
  type Koma,
  type Member,
  type MemberStatus,
  type NoticeContext,
  type PenaltyType,
  type PracticeDate,
  type PracticeException,
  type PracticeRule,
  type Punch,
  type Role,
  type Settings,
} from '../../../packages/core/src/index.ts';
import type { Sql } from './db.ts';

export type MemberRow = Member & {
  studentNo: string;
  name: string;
  grade: Grade;
  status: MemberStatus;
  role: Role;
  isAdmin: boolean;
};

export type StoredPunch = Punch & { id: number };

export async function loadSettings(sql: Sql): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from public.settings`;
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

const memberColumns = (sql: Sql) => sql`
  id, student_no as "studentNo", name, grade, status, role, is_admin as "isAdmin", approved,
  retired_on::text as "retiredOn"`;

export async function findMemberByDevice(sql: Sql, userId: string): Promise<MemberRow | null> {
  const [member] = await sql<MemberRow[]>`
    select ${memberColumns(sql)} from public.members where auth_user_id = ${userId}`;
  return member ?? null;
}

/** 名簿全体をロックして読む。複数の部員を変える操作で使う。 */
export async function lockRoster(sql: Sql): Promise<MemberRow[]> {
  return sql<MemberRow[]>`
    select ${memberColumns(sql)} from public.members order by id for update`;
}

/**
 * この端末の部員を読み、トランザクションが終わるまで行をロックする。
 * 同じ人の打刻や判定が同時に走らないようにする。
 */
export async function lockMemberByDevice(sql: Sql, userId: string): Promise<MemberRow | null> {
  const [member] = await sql<MemberRow[]>`
    select ${memberColumns(sql)} from public.members
    where auth_user_id = ${userId} for update`;
  return member ?? null;
}

/** 判定の対象になる部員（承認済みで在籍中）をロックして読む。 */
export async function lockJudgeableMembers(
  sql: Sql,
  memberIds: readonly string[] | null,
): Promise<MemberRow[]> {
  return sql<MemberRow[]>`
    select ${memberColumns(sql)} from public.members
    where approved and status in ('active', 'retired')
      ${memberIds ? sql`and id in ${sql(memberIds as string[])}` : sql``}
    order by id for update`;
}

export async function loadRules(sql: Sql): Promise<PracticeRule[]> {
  return sql<PracticeRule[]>`
    select weekday, condition, part, to_char(deadline, 'HH24:MI') as deadline,
      to_char(start_time, 'HH24:MI') as "startTime", to_char(end_time, 'HH24:MI') as "endTime"
    from public.practice_rules`;
}

export async function loadKoma(sql: Sql, memberIds: readonly string[]): Promise<Map<string, Koma>> {
  if (memberIds.length === 0) return new Map();
  const rows = await sql<(Koma & { memberId: string })[]>`
    select member_id as "memberId", mon4, mon5, tue4, tue5, thu4, thu5
    from public.koma where member_id in ${sql(memberIds as string[])}`;
  return new Map(rows.map(({ memberId, ...koma }) => [memberId, koma]));
}

export async function loadExceptions(
  sql: Sql,
  from: PracticeDate,
  to: PracticeDate = from,
): Promise<PracticeException[]> {
  return sql<PracticeException[]>`
    select date::text, member_id as "memberId", kind, memo, contacted_at as "contactedAt",
      approval, rejection_reason as "rejectionReason",
      coalesce(created_by = member_id, false) as "selfSubmitted",
      case when base_part is not null then jsonb_build_object(
        'part', base_part, 'deadline', to_char(base_deadline, 'HH24:MI')
      ) end as "basePlan",
      private.event_of(e) as event
    from public.exceptions e where date between ${from} and ${to}
    order by date, created_at, id`;
}

export async function loadPunches(
  sql: Sql,
  date: PracticeDate,
  memberIds: readonly string[],
): Promise<StoredPunch[]> {
  if (memberIds.length === 0) return [];
  return sql<StoredPunch[]>`
    select id::int, member_id as "memberId", punched_at as at, kind,
      canceled_at as "canceledAt"
    from public.punches
    where practice_date = ${date} and member_id in ${sql(memberIds as string[])}
    order by punched_at, id`;
}

export async function loadPenaltyTypes(sql: Sql): Promise<PenaltyType[]> {
  return sql<PenaltyType[]>`
    select reason, base_count as "baseCount", assigned_by as "assignedBy", description
    from public.penalty_types order by assigned_by, reason`;
}

/** 連絡とコマ変更の申請の可否を決めるのに必要なもの */
export async function loadNoticeContext(
  sql: Sql,
  member: MemberRow,
  now: Date,
): Promise<NoticeContext> {
  const today = toPracticeDate(now);
  const punches = await loadPunches(sql, today, [member.id]);
  return {
    member,
    now,
    rules: await loadRules(sql),
    koma: (await loadKoma(sql, [member.id])).get(member.id) ?? null,
    exceptions: await loadExceptions(sql, today, addDays(today, NOTICE_DAYS_AHEAD)),
    settings: await loadSettings(sql),
    enteredToday: punches.some((punch) => punch.kind === 'in' && !punch.canceledAt),
  };
}

export async function homeSnapshot(
  sql: Sql,
  userId: string,
  today: PracticeDate,
): Promise<unknown> {
  const [row] = await sql<{ home: unknown }[]>`
    select private.home_snapshot(${userId}, ${today}) as home`;
  return row?.home;
}
