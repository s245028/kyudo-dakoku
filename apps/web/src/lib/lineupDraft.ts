// 保存していない立ち順を端末に残し、ほかの画面を見たりアプリを閉じたりしても消えないようにする
import type { GroupSize, Lineup, Part } from '@kyudo/core';

export type LineupDraft = {
  lineup: Lineup;
  /** 編集のもとにした保存の日時。保存がなかったら null */
  base: string | null;
  /** 選んでいる1立ちの人数 */
  groupSize?: GroupSize;
  /** 戻せるように残す、前の内容。null は編集を始める前 */
  history?: (Lineup | null)[];
};

const PREFIX = 'kyudo.lineup.';
const keyOf = (date: string, part: Part) => `${PREFIX}${date}.${part}`;

export function readLineupDraft(date: string, part: Part): LineupDraft | null {
  try {
    const stored = localStorage.getItem(keyOf(date, part));
    const draft = stored ? (JSON.parse(stored) as LineupDraft) : null;
    return draft && Array.isArray(draft.lineup?.groups) ? draft : null;
  } catch {
    // 保存できない環境や、壊れた内容は無視する
    return null;
  }
}

/** `draft` が null なら消す。前の日の下書きは、書くときに片づける。 */
export function writeLineupDraft(date: string, part: Part, draft: LineupDraft | null): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && !key.startsWith(`${PREFIX}${date}.`)) {
        localStorage.removeItem(key);
      }
    }
    if (draft) localStorage.setItem(keyOf(date, part), JSON.stringify(draft));
    else localStorage.removeItem(keyOf(date, part));
  } catch {
    // 残せなくても、画面の上では編集できる
  }
}
