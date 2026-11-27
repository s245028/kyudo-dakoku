// 管理者でログインしているか。管理者のログインは部員とは別の場所に保存するので、
// 部員登録した端末で使っても、部員の登録は消えない。
const MODE_KEY = 'kyudo.mode';

export const ADMIN_STORAGE_KEY = 'kyudo.admin.auth';

export function isAdminMode(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === 'admin';
  } catch {
    return false;
  }
}

export function setAdminMode(on: boolean): void {
  if (on) localStorage.setItem(MODE_KEY, 'admin');
  else localStorage.removeItem(MODE_KEY);
}
