// 書き出し用に、表の全部の行を読む（主将）
import { ApiError, OFFLINE_MESSAGE } from './api.ts';
import { ensureSession, supabase } from './supabase.ts';

/** 1回に読める行の上限（データベースの設定）に合わせる */
const PAGE_SIZE = 1000;

/** `columns` は取り出す列、`orderBy` は順番が決まる列 */
export async function readEveryRow<T>(
  table: string,
  columns: string,
  orderBy: readonly string[],
): Promise<T[]> {
  await ensureSession();
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase().from(table).select(columns);
    for (const column of orderBy) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new ApiError(OFFLINE_MESSAGE);
    rows.push(...(data as unknown as T[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}
