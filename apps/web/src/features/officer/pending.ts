import type { OfficerSection } from '@kyudo/core';
import type { PendingItem } from './PendingList.tsx';

export type PendingCounts = { notices: number; members: number; tasks: number };

/** 対応を待っているものを、出す順に並べる */
export const pendingItems = ({ notices, members, tasks }: PendingCounts): PendingItem[] => [
  { section: 'notices', label: '事前連絡の承認待ち', count: notices, unit: '件' },
  { section: 'roster', label: '新しい部員の承認待ち', count: members, unit: '人' },
  { section: 'penalties', label: '罰のやること 割り当て待ち', count: tasks, unit: '個' },
];

/** 項目の一覧の赤丸に出す数 */
export const sectionCounts = (counts: PendingCounts): Partial<Record<OfficerSection, number>> =>
  Object.fromEntries(pendingItems(counts).map((item) => [item.section, item.count]));
