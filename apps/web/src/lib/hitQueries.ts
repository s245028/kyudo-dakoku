// 的中の記録を読む。読めるかどうかは、データベースの行単位の権限が決める
import type { HitCategory, HitDay, HitRecord, HitTally } from '@kyudo/core';
import { ApiError, OFFLINE_MESSAGE } from './api.ts';
import { readEveryRow } from './exportQueries.ts';
import { ensureSession, supabase } from './supabase.ts';

export type StoredHitRecord = HitRecord & { updatedAt: string };

export type HitHistoryEntry = {
  id: number;
  date: string;
  category: HitCategory;
  before: HitTally | null;
  after: HitTally | null;
  /** 空は、管理者ログインか、削除した部員 */
  changedBy: string | null;
  changedAt: string;
};

/** 一覧に出す変更の件数 */
const HISTORY_LIMIT = 50;

type Reply = { data: unknown; error: unknown };

async function read<T>(query: () => PromiseLike<Reply>): Promise<T> {
  await ensureSession();
  const { data, error } = await query();
  if (error) throw new ApiError(OFFLINE_MESSAGE);
  return data as T;
}

const emptyTallies = (): HitDay['tallies'] => ({
  standing: { shots: 0, hits: 0 },
  drill: { shots: 0, hits: 0 },
  self: { shots: 0, hits: 0 },
});

/** [部員, 日, 立ちの射数, 的中, 射込みの射数, 的中, 自練の射数, 的中] */
type DayRow = [string, string, number, number, number, number, number, number];

export async function loadHitDays(from: string, to: string): Promise<HitDay[]> {
  const rows = await read<DayRow[]>(() => supabase().rpc('hit_days', { p_from: from, p_to: to }));
  return rows.map(([memberId, date, ss, sh, ds, dh, fs, fh]) => ({
    memberId,
    date,
    tallies: {
      standing: { shots: ss, hits: sh },
      drill: { shots: ds, hits: dh },
      self: { shots: fs, hits: fh },
    },
  }));
}

export const loadHitRecords = (memberId: string, date: string) =>
  read<StoredHitRecord[]>(() =>
    supabase()
      .from('hit_records')
      .select('category, mode, shots, hits, rows, revision, updatedAt:updated_at')
      .eq('member_id', memberId)
      .eq('practice_date', date),
  );

type RecordRow = { date: string; category: HitCategory; shots: number; hits: number };

/** 1人の期間の記録を、日ごとにまとめる */
export async function loadMemberHitDays(
  memberId: string,
  from: string,
  to: string,
): Promise<HitDay[]> {
  const rows = await readEveryRow<RecordRow>(
    'hit_records',
    'date:practice_date, category, shots, hits',
    ['practice_date', 'category'],
    (query) => query.eq('member_id', memberId).gte('practice_date', from).lte('practice_date', to),
  );
  const days = new Map<string, HitDay>();
  for (const { date, category, shots, hits } of rows) {
    const day = days.get(date) ?? { memberId, date, tallies: emptyTallies() };
    day.tallies[category] = { shots, hits };
    days.set(date, day);
  }
  return [...days.values()];
}

export const loadHitHistory = (memberId: string, from: string, to: string) =>
  read<HitHistoryEntry[]>(() =>
    supabase()
      .from('hit_record_history')
      .select(
        'id, date:practice_date, category, before, after, changedBy:changed_by, changedAt:changed_at',
      )
      .eq('member_id', memberId)
      .gte('practice_date', from)
      .lte('practice_date', to)
      .order('changed_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  );
