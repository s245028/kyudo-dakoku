import { FunctionRegion, FunctionsHttpError } from '@supabase/supabase-js';
import { ensureSession, supabase } from './supabase.ts';

export const OFFLINE_MESSAGE = '通信できませんでした。電波を確認して、もう一度お試しください。';
const REQUEST_TIMEOUT_MS = 15_000;

/** 利用者にそのまま見せるエラー */
export class ApiError extends Error {}

export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : OFFLINE_MESSAGE;
}

type Reply = { ok: boolean; error?: string };

/** 書き込みの操作。Edge Function `api` の `action` を呼ぶ。 */
export async function callAction<T extends object>(
  action: string,
  params: object = {},
): Promise<T> {
  await ensureSession();
  const response = await supabase().functions.invoke<Reply & T>('api', {
    body: { action, ...params },
    // データベースと同じ東京で動かす
    region: FunctionRegion.ApNortheast1,
    timeout: REQUEST_TIMEOUT_MS,
  });
  const data = response.data;
  const error: unknown = response.error;
  if (error instanceof FunctionsHttpError) {
    const body = (await (error.context as Response).json().catch(() => null)) as Reply | null;
    throw new ApiError(body?.error ?? OFFLINE_MESSAGE);
  }
  if (error || !data) throw new ApiError(OFFLINE_MESSAGE);
  if (!data.ok) throw new ApiError(data.error ?? OFFLINE_MESSAGE);
  return data;
}

/** 読み取り用のデータベース関数を呼ぶ。 */
export async function callFunction<T>(
  name: 'home' | 'presence' | 'penalty_board' | 'published_lineups',
): Promise<T> {
  await ensureSession();
  const response = await supabase().rpc(name);
  if (response.error) throw new ApiError(OFFLINE_MESSAGE);
  return response.data as T;
}
