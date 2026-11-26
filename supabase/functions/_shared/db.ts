import type { Sql } from 'postgres';

export type { Sql };

/**
 * ローカルの Supabase が渡すホスト名はアンダースコアを含み、Edge Runtime が名前を解決できない。
 * 同じ接続先の別名に置き換える。クラウドの接続先は変えない。
 */
export function reachableDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname.startsWith('supabase_db_')) parsed.hostname = 'db';
  return parsed.href;
}

/** 複数の表の更新を、まとめて成功か失敗にする。 */
export async function inTransaction<T>(sql: Sql, work: (tx: Sql) => Promise<T>): Promise<T> {
  // postgres.js の型では、トランザクション内の sql を関数として呼べないため合わせる
  const result = await sql.begin((tx) => work(tx as unknown as Sql));
  return result as T;
}
