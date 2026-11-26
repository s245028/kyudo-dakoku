// 夜の自動処理。データベースの定期実行（pg_cron）だけが呼ぶ。
import postgres from 'postgres';
import { reachableDatabaseUrl } from '../_shared/db.ts';
import { runNightly } from '../_shared/nightly.ts';

const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
if (!databaseUrl) throw new Error('環境変数 SUPABASE_DB_URL がありません');

const sql = postgres(reachableDatabaseUrl(databaseUrl), {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

/** 合言葉が Vault のものと同じかを、データベースで確かめる。 */
async function isFromDatabase(secret: string): Promise<boolean> {
  const [match] = await sql`
    select 1 from vault.decrypted_secrets
    where name = 'nightly_secret'
      and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(${secret}, 'sha256')`;
  return match !== undefined;
}

Deno.serve(async (request) => {
  try {
    const secret = request.headers.get('x-nightly-secret');
    if (request.method !== 'POST' || !secret || !(await isFromDatabase(secret))) {
      return Response.json({ ok: false }, { status: 401 });
    }
    return Response.json({ ok: true, ...(await runNightly(sql, new Date())) });
  } catch (error) {
    const { name, code } = error as { name?: string; code?: string };
    console.error('nightly failed', name, code);
    return Response.json({ ok: false }, { status: 500 });
  }
});
