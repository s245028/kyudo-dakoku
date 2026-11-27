import { ApiError, OFFLINE_MESSAGE } from './api.ts';
import { setAdminMode } from './adminMode.ts';
import { isAdminHome, type Home } from './home.ts';
import { createAppClient, supabase } from './supabase.ts';

/** 入力し直しても、同じ保存場所を使う接続は1つにする */
let loginClient: ReturnType<typeof createAppClient> | undefined;

/** ログインに成功したら、管理者の画面を読み込み直す。 */
export async function logInAsAdmin(email: string, password: string): Promise<void> {
  loginClient ??= createAppClient(true);
  const client = loginClient;
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) {
    throw new ApiError(
      signedIn.error.status === 400
        ? 'メールアドレスまたはパスワードが違います。'
        : OFFLINE_MESSAGE,
    );
  }
  const home = await client.rpc('home');
  if (home.error || !isAdminHome(home.data as Home)) {
    await client.auth.signOut({ scope: 'local' });
    throw new ApiError(
      home.error ? OFFLINE_MESSAGE : 'このアカウントは管理者として登録されていません。',
    );
  }
  setAdminMode(true);
  location.reload();
}

export async function logOutAdmin(): Promise<void> {
  // 通信できなくても、この端末は部員の画面に戻す
  await supabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => {});
  setAdminMode(false);
  location.reload();
}
