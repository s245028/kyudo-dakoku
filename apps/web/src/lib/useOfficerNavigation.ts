import type { OfficerSection, OpenTarget } from '@kyudo/core';
import { useEffect, useState } from 'react';
import type { TabId } from '../components/tabs.ts';
import { firstSection } from '../features/officer/sections.ts';
import { initialOpenTarget, onOpenRequest } from './openRequest.ts';

/** 下のタブか、左上の3本線から開く役職の画面 */
export type ViewId = TabId | 'officer';

/** 通知の指定に当たる画面と、役職の画面の項目 */
const DESTINATIONS: Record<OpenTarget, { view: ViewId; section?: OfficerSection }> = {
  notices: { view: 'officer', section: 'notices' },
  members: { view: 'officer', section: 'roster' },
  penalties: { view: 'officer', section: 'penalties' },
  scan: { view: 'scan' },
};

/**
 * 開いている画面と、役職の画面の項目と一覧。通知を押して開いたら、その画面にする。
 * `allowed` はその人が開ける項目。
 */
export function useOfficerNavigation(
  initialView: ViewId,
  allowed: readonly OfficerSection[],
  pending: { notices: number; members: number },
) {
  const initial = initialOpenTarget && DESTINATIONS[initialOpenTarget];
  const [view, setView] = useState<ViewId>(initial?.view ?? initialView);
  const [section, setSection] = useState<OfficerSection | null>(initial?.section ?? null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(
    () =>
      onOpenRequest((target) => {
        const next = DESTINATIONS[target];
        setView(next.view);
        if (next.section) setSection(next.section);
        setMenuOpen(false);
      }),
    [],
  );

  return {
    view,
    // 役職が変わって開けなくなった項目は、出さない
    section: section && allowed.includes(section) ? section : firstSection(allowed, pending),
    menuOpen,
    setMenuOpen,
    select: (next: ViewId) => {
      setMenuOpen(false);
      setView(next);
    },
    /** 役職の画面の項目を開く */
    openSection: (next: OfficerSection) => {
      setMenuOpen(false);
      setSection(next);
      setView('officer');
    },
  };
}
