import type { RequestContext } from './context.ts';
import { AppError } from './errors.ts';
import { join, unjoin } from './actions/join.ts';
import { setKoma } from './actions/koma.ts';
import { register } from './actions/register.ts';
import { scan, undoScan } from './actions/scan.ts';
import type { Params } from './params.ts';

type Action = (context: RequestContext, params: Params) => Promise<object>;

/** アプリからの書き込みの一覧。名前はアプリ側の呼び出しと合わせる */
export const ACTIONS = {
  register,
  'set-koma': setKoma,
  scan,
  'undo-scan': undoScan,
  join,
  unjoin,
} satisfies Record<string, Action>;

export type ActionName = keyof typeof ACTIONS;

export type ActionResult = ({ ok: true } & object) | { ok: false; error: string };

export async function runAction(
  context: RequestContext,
  name: unknown,
  params: Params,
): Promise<ActionResult> {
  try {
    if (typeof name !== 'string' || !Object.hasOwn(ACTIONS, name)) {
      throw new AppError('不明な操作です');
    }
    return { ok: true, ...(await ACTIONS[name as ActionName](context, params)) };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}
