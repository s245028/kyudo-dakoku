// 主将・副務が表を直接読む。読めるかどうかは、データベースの行単位の権限が決める。
import {
  NOTICE_KINDS,
  type EditableSettings,
  type Gender,
  type Grade,
  type Judgement,
  type ManualJudgement,
  type MemberStatus,
  type PenaltyType,
  type PracticeException,
  type PracticeRule,
  type Role,
} from '@kyudo/core';
import { ApiError, OFFLINE_MESSAGE } from './api.ts';
import { ensureSession, supabase } from './supabase.ts';

export type RosterEntry = {
  id: string;
  studentNo: string;
  name: string;
  grade: Grade;
  gender: Gender;
  status: MemberStatus;
  role: Role;
  approved: boolean;
  retiredOn: string | null;
  linked: boolean;
};

export type StoredException = Omit<PracticeException, 'contactedAt' | 'basePlan'> & {
  id: string;
  contactedAt: string | null;
  /** コマ変更を申請したときの、変更前の集合時刻 */
  baseDeadline: string | null;
};

const EXCEPTION_COLUMNS =
  'id, date, memberId:member_id, kind, memo, contactedAt:contacted_at, approval, rejectionReason:rejection_reason, createdBy:created_by, baseDeadline:base_deadline';

type ExceptionReply = Omit<StoredException, 'selfSubmitted'> & { createdBy: string | null };

const toStoredException = ({ createdBy, ...exception }: ExceptionReply): StoredException => ({
  ...exception,
  selfSubmitted: createdBy !== null && createdBy === exception.memberId,
});

export type AttendanceEntry = {
  memberId: string;
  deadline: string;
  firstIn: string | null;
  lastOut: string | null;
  autoResult: Judgement;
  manualResult: ManualJudgement | null;
  manualReason: string;
  finalResult: Judgement;
  note: string;
};

export type StoredRule = PracticeRule & { id: string };

type Reply = { data: unknown; error: unknown };

export async function read<T>(query: () => PromiseLike<Reply>): Promise<T> {
  await ensureSession();
  const { data, error } = await query();
  if (error) throw new ApiError(OFFLINE_MESSAGE);
  return data as T;
}

export const loadRoster = () =>
  read<RosterEntry[]>(() =>
    supabase()
      .from('members')
      .select(
        'id, studentNo:student_no, name, grade, gender, status, role, approved, retiredOn:retired_on, linked',
      )
      .order('student_no'),
  );

export const loadPenaltyTypes = () =>
  read<PenaltyType[]>(() =>
    supabase()
      .from('penalty_types')
      .select('reason, baseCount:base_count, assignedBy:assigned_by, description')
      .order('assigned_by')
      .order('reason'),
  );

/** 割り当てたやること（新しい順）。入力候補に使う */
export async function loadRecentTaskContents(): Promise<string[]> {
  const rows = await read<{ content: string }[]>(() =>
    supabase()
      .from('penalty_tasks')
      .select('content')
      .order('assigned_at', { ascending: false })
      .limit(200),
  );
  return rows.map((row) => row.content);
}

export async function loadExceptionsSince(date: string): Promise<StoredException[]> {
  const rows = await read<ExceptionReply[]>(() =>
    supabase()
      .from('exceptions')
      .select(EXCEPTION_COLUMNS)
      .gte('date', date)
      .order('date')
      .order('created_at'),
  );
  return rows.map(toStoredException);
}

/** 欠席・遅刻の連絡と、コマ変更の申請。指定した日以降のものと、それより前の承認待ち。 */
export async function loadNotices(since: string): Promise<StoredException[]> {
  const rows = await read<ExceptionReply[]>(() =>
    supabase()
      .from('exceptions')
      .select(EXCEPTION_COLUMNS)
      .or(`kind.in.(${NOTICE_KINDS.join(',')}),approval.not.is.null`)
      .or(`approval.eq.pending,date.gte.${since}`)
      .order('date')
      .order('created_at'),
  );
  return rows.map(toStoredException);
}

export const loadAttendance = (date: string) =>
  read<AttendanceEntry[]>(() =>
    supabase()
      .from('attendance')
      .select(
        'memberId:member_id, deadline, firstIn:first_in, lastOut:last_out, autoResult:auto_result, manualResult:manual_result, manualReason:manual_reason, finalResult:final_result, note',
      )
      .eq('practice_date', date)
      .order('deadline'),
  );

export async function loadSettings(): Promise<EditableSettings> {
  const rows = await read<{ key: string; value: unknown }[]>(() =>
    supabase().from('settings').select('key, value').neq('key', 'entranceQr'),
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as EditableSettings;
}

export async function loadRules(): Promise<StoredRule[]> {
  const rows = await read<StoredRule[]>(() =>
    supabase()
      .from('practice_rules')
      .select('id, weekday, condition, part, deadline, startTime:start_time')
      .order('weekday')
      .order('deadline'),
  );
  // データベースの時刻は秒まであるので、`HH:mm` にそろえる
  return rows.map((rule) => ({
    ...rule,
    deadline: rule.deadline.slice(0, 5),
    startTime: rule.startTime.slice(0, 5),
  }));
}

export type NightlyRun = { date: string; ranAt: string; checkedOut: number; judged: number };

export async function loadLastNightlyRun(): Promise<NightlyRun | null> {
  const rows = await read<NightlyRun[]>(() =>
    supabase()
      .from('nightly_runs')
      .select('date:practice_date, ranAt:ran_at, checkedOut:checked_out, judged')
      .order('practice_date', { ascending: false })
      .limit(1),
  );
  return rows[0] ?? null;
}

export async function loadLastPromotionYear(): Promise<number | null> {
  const rows = await read<{ year: number }[]>(() =>
    supabase()
      .from('grade_promotions')
      .select('year:fiscal_year')
      .order('fiscal_year', { ascending: false })
      .limit(1),
  );
  return rows[0]?.year ?? null;
}
