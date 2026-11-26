import { useState } from 'react';
import { callAction, messageOf } from './api.ts';

/** 書き込みの操作を1つずつ実行し、送信中とエラーを持つ。 */
export function useAction() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  /** 成功したら `done` を呼んで true を返す。 */
  async function run<T extends object>(
    action: string,
    params: object,
    done?: (reply: T) => unknown,
  ): Promise<boolean> {
    setSending(true);
    setError('');
    try {
      const reply = await callAction<T>(action, params);
      await done?.(reply);
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setSending(false);
    }
  }

  return { sending, error, run };
}
