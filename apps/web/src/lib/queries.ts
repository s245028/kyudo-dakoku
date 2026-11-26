// 主将・副務が表を直接読む。読めるかどうかは、データベースの行単位の権限が決める。
import type {
  EditableSettings,
  Grade,
  Judgement,
  ManualJudgement,
  MemberStatus,
  PenaltyType,
  PracticeException,
  PracticeRule,
  Role,
} from '@kyudo/core';
import { ApiError, OFFLINE_MESSAGE } from './api.ts';
import { ensureSession, supabase } from './supabase.ts';

export type RosterEntry = {
  id: string;
  studentNo: string;
  name: string;
  grade: Grade;
  status: MemberStatus;
  role: Role;
  approved: boolean;
  retiredOn: string | null;
  linked: boolean;
};

export type StoredException = Omit<PracticeException, 'contactedAt'> & {
  id: string;
  contactedAt: string | null;
};

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

async function read<T>(query: () => PromiseLike<Reply>): Promise<T> {
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
        'id, studentNo:student_no, name, grade, status, role, approved, retiredOn:retired_on, linked',
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

export const loadExceptionsSince = (date: string) =>
  read<StoredException[]>(() =>
    supabase()
      .from('exceptions')
      .select('id, date, memberId:member_id, kind, memo, contactedAt:contacted_at')
      .gte('date', date)
      .order('date')
      .order('created_at'),
  );

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
