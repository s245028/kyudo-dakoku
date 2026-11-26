import { ensureSession, supabase } from './supabase.ts';

/**
 * 打刻が変わったという通知を受け取る。つながったときにも `onChange` を呼び、
 * 切れていた間の変化を取りこぼさない。戻り値を呼ぶと受け取りをやめる。
 */
export function watchPresence(onChange: () => void): () => void {
  let stopped = false;
  let stop = () => {};

  async function start() {
    await ensureSession();
    // 本人にだけ届く通知なので、ログインの情報を渡してからつなぐ
    await supabase().realtime.setAuth();
    if (stopped) return;
    const channel = supabase()
      .channel('presence', { config: { private: true } })
      .on('broadcast', { event: 'changed' }, onChange)
      .subscribe((state) => {
        if (String(state) === 'SUBSCRIBED') onChange();
      });
    stop = () => void supabase().removeChannel(channel);
  }

  // つながらなくても、一覧は「更新」ボタンで読み直せる
  start().catch(() => {});
  return () => {
    stopped = true;
    stop();
  };
}
