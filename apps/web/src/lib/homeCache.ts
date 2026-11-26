// 前回のホーム画面の内容を端末に保存し、開いた瞬間に表示する
import type { HomeData } from './home.ts';

const KEY = 'kyudo.home.v1';

export function readCachedHome(): HomeData | null {
  try {
    const stored = localStorage.getItem(KEY);
    const home = stored ? (JSON.parse(stored) as HomeData) : null;
    return home?.member && home.settings && home.rules ? home : null;
  } catch {
    // 保存できない環境や、壊れた内容は無視する
    return null;
  }
}

export function writeCachedHome(home: HomeData | null): void {
  try {
    if (home) localStorage.setItem(KEY, JSON.stringify(home));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても、アプリは動く
  }
}
