import type { OpenTarget } from '@kyudo/core';
import { useEffect, useState } from 'react';
import type { TabId } from '../components/tabs.ts';
import { firstSection, type SectionId } from '../features/admin/sections.ts';
import { initialOpenTarget, onOpenRequest } from './openRequest.ts';

/** 通知の指定に当たるタブと、管理画面の項目 */
const DESTINATIONS: Record<OpenTarget, { tab: TabId; section?: SectionId }> = {
  notices: { tab: 'admin', section: 'notices' },
  members: { tab: 'admin', section: 'roster' },
  scan: { tab: 'scan' },
};

/** 開いているタブと管理画面の項目。通知を押して開いたら、その画面にする。 */
export function useOfficerNavigation(
  initialTab: TabId,
  pending: { notices: number; members: number },
) {
  const initial = initialOpenTarget && DESTINATIONS[initialOpenTarget];
  const [tab, setTab] = useState<TabId>(initial?.tab ?? initialTab);
  const [section, setSection] = useState<SectionId | null>(initial?.section ?? null);

  useEffect(
    () =>
      onOpenRequest((target) => {
        const next = DESTINATIONS[target];
        setTab(next.tab);
        if (next.section) setSection(next.section);
      }),
    [],
  );

  return {
    tab,
    section: section ?? firstSection(pending),
    setSection,
    select: (next: TabId) => {
      // はじめて開いたときの項目を覚え、数が変わっても勝手に切り替えない
      if (next === 'admin' && !section) setSection(firstSection(pending));
      setTab(next);
    },
  };
}
