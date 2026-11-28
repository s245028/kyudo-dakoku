// 一射ずつの入力の下書き。端末に残しながら、少し手が止まったら自動で保存する
import type { HitCategory, ShotRow } from '@kyudo/core';
import { ApiError, callAction, OfflineError } from './api.ts';
import type { StoredHitRecord } from './hitQueries.ts';

/** 最後に押してから、保存するまで */
const SAVE_DELAY_MS = 3000;
/** 届かなかったとき、送り直すまで */
const RETRY_DELAY_MS = 15_000;
const STORAGE_KEY = 'hit-drafts';

export type HitTarget = { memberId: string; date: string; category: HitCategory };

export type HitDraft = HitTarget & {
  rows: ShotRow[];
  /** 直し始めたときの記録の番号。記録がなかったときは null */
  baseRevision: number | null;
  /** 何回目の変更か。送っている間に変わったかを確かめる */
  edit: number;
  /** 自動では保存できない理由。`conflict` はほかで記録が変わった */
  problem?: { conflict: boolean; message: string };
};

export type SaveReply = { conflict: boolean; records: StoredHitRecord[] };

export const draftKey = ({ memberId, date, category }: HitTarget) =>
  `${memberId}/${date}/${category}`;

type Drafts = Readonly<Record<string, HitDraft>>;

function readStored(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Drafts;
  } catch {
    return {};
  }
}

let drafts: Drafts = readStored();
const draftListeners = new Set<() => void>();
const savedListeners = new Set<(target: HitTarget, records: StoredHitRecord[]) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;

function store(next: Drafts) {
  drafts = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 端末に残せなくても、開いている間は保存できる
  }
  for (const listener of draftListeners) listener();
}

const set = (draft: HitDraft) => store({ ...drafts, [draftKey(draft)]: draft });

export const readDrafts = () => drafts;

export function subscribeDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

/** 保存できた内容を受け取る */
export function subscribeSaved(
  listener: (target: HitTarget, records: StoredHitRecord[]) => void,
): () => void {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}

function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void flushDrafts(), delay);
}

/** 入力を下書きにする。`baseRevision` は、下書きがないときの今の記録の番号 */
export function putDraft(target: HitTarget, rows: ShotRow[], baseRevision: number | null) {
  const current = drafts[draftKey(target)];
  set({
    memberId: target.memberId,
    date: target.date,
    category: target.category,
    rows,
    baseRevision: current ? current.baseRevision : baseRevision,
    edit: (current?.edit ?? 0) + 1,
    // ほかで変わったことは、本人が選ぶまで残す
    ...(current?.problem?.conflict ? { problem: current.problem } : {}),
  });
  schedule(SAVE_DELAY_MS);
}

export function discardDraft(target: HitTarget) {
  store(Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== draftKey(target))));
}

/** ほかで変わった記録を、この端末の入力で置き換える */
export function overwriteWithDraft(target: HitTarget, revision: number | null) {
  const current = drafts[draftKey(target)];
  if (!current) return;
  const draft: HitDraft = { ...current, baseRevision: revision };
  delete draft.problem;
  set(draft);
  schedule(0);
}

async function send(draft: HitDraft) {
  const { memberId, date, category, rows, baseRevision } = draft;
  const reply = await callAction<SaveReply>('save-hits', {
    memberId,
    date,
    entries: [{ category, mode: 'shots', rows, baseRevision }],
  });
  const current = drafts[draftKey(draft)];
  if (reply.conflict) {
    if (current) {
      const message = 'ほかで記録が変わったため、保存していません。';
      set({ ...current, problem: { conflict: true, message } });
    }
  }
  // 画面の内容を先に新しくしてから、下書きを消す
  for (const listener of savedListeners) listener(draft, reply.records);
  if (reply.conflict || !current) return;
  if (current.edit === draft.edit) {
    discardDraft(draft);
    return;
  }
  // 送っている間の入力は、今の番号から続ける
  const saved = reply.records.find((record) => record.category === category);
  set({ ...current, baseRevision: saved?.revision ?? null });
}

/** まだ保存していない下書きを送る */
export async function flushDrafts(): Promise<void> {
  if (sending) return;
  sending = true;
  clearTimeout(timer);
  let offline = false;
  for (const draft of Object.values(drafts).filter((candidate) => !candidate.problem)) {
    try {
      await send(draft);
    } catch (error) {
      if (error instanceof OfflineError || !(error instanceof ApiError)) {
        offline = true;
        break;
      }
      const current = drafts[draftKey(draft)];
      if (current) set({ ...current, problem: { conflict: false, message: error.message } });
    }
  }
  sending = false;
  if (Object.values(drafts).some((draft) => !draft.problem)) {
    schedule(offline ? RETRY_DELAY_MS : SAVE_DELAY_MS);
  }
}

/** 通信が戻ったときと、画面を離れるときにも送る。戻り値を呼ぶとやめる */
export function startDraftSync(): () => void {
  const flush = () => void flushDrafts();
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', flush);
  flush();
  return () => {
    window.removeEventListener('online', flush);
    document.removeEventListener('visibilitychange', flush);
  };
}
