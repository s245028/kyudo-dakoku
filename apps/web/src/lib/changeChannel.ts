import { ensureSession, supabase } from './supabase.ts';

/** 変わったことを知らせる通知の種類。在室（打刻）と、的中の記録 */
export type ChangeTopic = 'presence' | 'hits';

/**
 * 内容が変わったという通知を受け取る。つながったときにも `onChange` を呼び、
 * 切れていた間の変化を取りこぼさない。戻り値を呼ぶと受け取りをやめる。
 */
export function watchChanges(topic: ChangeTopic, onChange: () => void): () => void {
  let stopped = false;
  let stop = () => {};

  async function start() {
    await ensureSession();
    // 本人にだけ届く通知なので、ログインの情報を渡してからつなぐ
    await supabase().realtime.setAuth();
    if (stopped) return;
    const channel = supabase()
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, onChange)
      .subscribe((state) => {
        if (String(state) === 'SUBSCRIBED') onChange();
      });
    stop = () => void supabase().removeChannel(channel);
  }

  // つながらなくても、画面を開き直せば読み直せる
  start().catch(() => {});
  return () => {
    stopped = true;
    stop();
  };
}
