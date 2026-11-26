import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  if (!url || !publishableKey) throw new Error('接続先が設定されていません');
  client ??= createClient(url, publishableKey);
  return client;
}

let signingIn: Promise<string> | undefined;

async function signIn(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  if (data.session) return data.session.user.id;
  const result = await supabase().auth.signInAnonymously();
  if (result.error || !result.data.user) {
    throw result.error ?? new Error('ログインできませんでした');
  }
  return result.data.user.id;
}

/** この端末の匿名ログインを用意する。同時に呼ばれても、ログインは1回だけ。 */
export function ensureSession(): Promise<string> {
  signingIn ??= signIn().finally(() => {
    signingIn = undefined;
  });
  return signingIn;
}
