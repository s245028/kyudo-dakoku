// アプリからの書き込みを受け付ける。操作は本文の `action` で選ぶ。
// 1つの関数にまとめることで、起動の待ち時間（コールドスタート）を減らす。
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { reachableDatabaseUrl } from '../_shared/db.ts';
import { runAction } from '../_shared/router.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`環境変数 ${name} がありません`);
  return value;
};

const sql = postgres(reachableDatabaseUrl(env('SUPABASE_DB_URL')), {
  prepare: false,
  max: 2,
  idle_timeout: 20,
});
const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const reply = (body: object, status = 200) => Response.json(body, { status, headers: corsHeaders });

/** ログイン中の端末の識別子。署名を確かめられなければ null */
async function verifiedUserId(request: Request): Promise<string | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const { data, error } = await auth.getClaims(token);
  if (error || !data || data.claims.role !== 'authenticated') return null;
  return data.claims.sub;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ ok: false, error: '不明な操作です' }, 405);
  try {
    const userId = await verifiedUserId(request);
    if (!userId) {
      return reply({ ok: false, error: 'アプリを開き直して、もう一度お試しください。' }, 401);
    }
    const body: unknown = await request.json().catch(() => null);
    const params = typeof body === 'object' && body !== null ? body : {};
    const { action, ...rest } = params as Record<string, unknown>;
    return reply(await runAction({ sql, userId, now: new Date() }, action, rest));
  } catch (error) {
    // 個人情報がログに残らないよう、種類とコードだけを出す
    const { name, code } = error as { name?: string; code?: string };
    console.error('api failed', name, code);
    return reply(
      { ok: false, error: 'エラーが発生しました。時間をおいて、もう一度お試しください。' },
      500,
    );
  }
});
