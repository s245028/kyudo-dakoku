import type { RequestContext } from './context.ts';
import { AppError } from './errors.ts';
import {
  addException,
  deleteException,
  rejudge,
  setManualJudgement,
} from './actions/attendance.ts';
import { deleteRule, savePenaltyType, saveRule, updateSettings } from './actions/configuration.ts';
import { join, unjoin } from './actions/join.ts';
import { setKoma } from './actions/koma.ts';
import { cancelKomaChange, submitKomaChange } from './actions/koma-requests.ts';
import { deleteLineup, saveLineup } from './actions/lineups.ts';
import { cancelNotice, reviewNotice, submitNotice } from './actions/notices.ts';
import { approveMember, deleteMember, resetDevice, updateMember } from './actions/members.ts';
import {
  addPenalty,
  assignTask,
  closePenalty,
  completeTask,
  editTask,
} from './actions/penalties.ts';
import { pushConfig, pushSubscribe, pushUnsubscribe } from './actions/push.ts';
import { register } from './actions/register.ts';
import { scan, undoScan } from './actions/scan.ts';
import { changeGeneration, promoteGrades } from './actions/yearly.ts';
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
  'submit-notice': submitNotice,
  'cancel-notice': cancelNotice,
  'submit-koma-change': submitKomaChange,
  'cancel-koma-change': cancelKomaChange,
  'push-config': pushConfig,
  'push-subscribe': pushSubscribe,
  'push-unsubscribe': pushUnsubscribe,
  // 副務・主将
  'add-penalty': addPenalty,
  'assign-task': assignTask,
  'edit-task': editTask,
  'complete-task': completeTask,
  // 主将
  'admin-close-penalty': closePenalty,
  'admin-approve': approveMember,
  'admin-update-member': updateMember,
  'admin-reset-device': resetDevice,
  'admin-delete-member': deleteMember,
  'admin-add-exception': addException,
  'admin-delete-exception': deleteException,
  'admin-review-notice': reviewNotice,
  'admin-save-lineup': saveLineup,
  'admin-delete-lineup': deleteLineup,
  'admin-rejudge': rejudge,
  'admin-set-manual': setManualJudgement,
  'admin-update-settings': updateSettings,
  'admin-save-rule': saveRule,
  'admin-delete-rule': deleteRule,
  'admin-save-penalty-type': savePenaltyType,
  'change-generation': changeGeneration,
  'promote-grades': promoteGrades,
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
