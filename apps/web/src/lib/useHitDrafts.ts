import { useSyncExternalStore } from 'react';
import { readDrafts, subscribeDrafts } from './hitSync.ts';

/** 保存していない下書き。変わると画面を作り直す */
export const useHitDrafts = () => useSyncExternalStore(subscribeDrafts, readDrafts);
