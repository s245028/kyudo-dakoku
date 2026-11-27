// 罰とやることの全部の記録を読む（主将・副務・管理者）。集計と書き出しで使う
import { toPracticeDate, type PenaltyRecord, type PenaltyTask } from '@kyudo/core';
import { readEveryRow } from './exportQueries.ts';

export type PenaltyRow = {
  id: string;
  practice_date: string;
  member_id: string;
  reason: string;
  base_count: number;
  memo: string;
  created_by: string | null;
  completed_on: string | null;
  counted_from: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  auto_key: string | null;
};

export type TaskRow = {
  id: string;
  penalty_id: string;
  content: string;
  assigned_at: string;
  assigned_by: string | null;
  done_at: string | null;
  done_by: string | null;
};

export const loadPenaltyRows = () =>
  readEveryRow<PenaltyRow>('penalties', '*', ['practice_date', 'id']);
export const loadTaskRows = () =>
  readEveryRow<TaskRow>('penalty_tasks', '*', ['assigned_at', 'id']);

const toPenaltyTask = (row: TaskRow): PenaltyTask => ({
  id: row.id,
  content: row.content,
  completedOn: row.done_at ? toPracticeDate(new Date(row.done_at)) : null,
});

export function toPenaltyRecord(row: PenaltyRow, tasks: readonly TaskRow[]): PenaltyRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    date: row.practice_date,
    reason: row.reason,
    baseCount: row.base_count,
    countedFrom: row.counted_from,
    canceled: row.canceled_at !== null,
    completed: row.completed_on !== null,
    tasks: tasks.filter((task) => task.penalty_id === row.id).map(toPenaltyTask),
  };
}
