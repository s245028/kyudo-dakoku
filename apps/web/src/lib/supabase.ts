import { createClient } from '@supabase/supabase-js';
import { ADMIN_STORAGE_KEY, isAdminMode, setAdminMode } from './adminMode.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && publishableKey);

let client: ReturnType<typeof createAppClient> | undefined;

export function createAppClient(admin: boolean) {
  if (!url || !publishableKey) throw new Error('接続先が設定されていません');
  return createClient(
    url,
    publishableKey,
    admin ? { auth: { storageKey: ADMIN_STORAGE_KEY } } : undefined,
  );
}

/** 部員か管理者、どちらかのログインを使う接続。切り替えるときは画面を読み込み直す。 */
export function supabase() {
  client ??= createAppClient(isAdminMode());
  return client;
}

let signingIn: Promise<string> | undefined;

async function signIn(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  if (data.session) return data.session.user.id;
  if (isAdminMode()) {
    // 管理者のログインが切れたら、部員の画面に戻る
    setAdminMode(false);
    location.reload();
    throw new Error('管理者のログインが切れました');
  }
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
