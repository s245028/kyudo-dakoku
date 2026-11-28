import { OFFICER_SECTIONS, toPracticeDate, type OfficerSection } from '@kyudo/core';
import { useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { TabBar } from './components/TabBar.tsx';
import type { TabId } from './components/tabs.ts';
import { HitsTab } from './features/hits/HitsTab.tsx';
import { LazyOfficerTab } from './features/officer/LazyOfficerTab.tsx';
import { OfficerMenu } from './features/officer/OfficerMenu.tsx';
import { sectionCounts } from './features/officer/pending.ts';
import { PenaltyTab } from './features/penalties/PenaltyTab.tsx';
import { PresenceTab } from './features/presence/PresenceTab.tsx';
import { ICON_BADGE_NOTE } from './features/profile/iconBadgeNote.ts';
import { NotificationCard } from './features/profile/NotificationCard.tsx';
import { logOutAdmin } from './lib/adminAuth.ts';
import { startDraftSync } from './lib/hitSync.ts';
import { useAppBadge } from './lib/useAppBadge.ts';
import type { AdminHome, Home } from './lib/home.ts';
import { useOfficerNavigation } from './lib/useOfficerNavigation.ts';
import { useUnassignedPenalties } from './lib/useUnassignedPenalties.ts';

const ADMIN_TABS: TabId[] = ['presence', 'hits', 'penalty'];
const HIT_VIEWER = { memberId: null, approved: true, canCorrect: true };
const VIEWER = { memberId: null, admin: true };
const OFFICER_VIEWER = { memberId: null, administers: true, isAdmin: true };

/** 管理者の画面。打刻はせず、左上の3本線の管理の項目と、在室・的中・罰を使う。 */
export function AdminScreen({
  home,
  now,
  onHome,
  onRefresh,
}: {
  home: AdminHome;
  now: Date;
  onHome: (home: Home) => void;
  onRefresh: () => void;
}) {
  const pending = { notices: home.pendingNotices ?? 0, members: home.pendingMembers ?? 0 };
  const navigation = useOfficerNavigation('officer', OFFICER_SECTIONS, pending);
  const { view } = navigation;
  const today = toPracticeDate(now);
  const tasks = useUnassignedPenalties(true, today, home.settings.penaltyDoublingDays, home);
  const counts = { ...pending, tasks: tasks ?? 0 };
  const waiting = counts.notices + counts.members + counts.tasks;
  // 罰を数え終えるまでは、アイコンの数字を変えない
  useAppBadge(tasks === null ? null : waiting);
  useEffect(() => startDraftSync(), []);

  // 画面を切り替えるたびに、対応を待っている数も読み直す
  function openSection(section: OfficerSection) {
    navigation.openSection(section);
    onRefresh();
  }

  return (
    <>
      <Header
        title="管理者"
        subtitle="開発用のログイン"
        role="管理者"
        menu={{
          waiting,
          open: navigation.menuOpen,
          onOpen: () => navigation.setMenuOpen(true),
        }}
      />
      <main className="app-main">
        <div className="toolbar">
          <button type="button" className="small secondary" onClick={() => void logOutAdmin()}>
            ログアウト
          </button>
        </div>
        {view === 'officer' && (
          <>
            <LazyOfficerTab
              today={today}
              viewer={OFFICER_VIEWER}
              section={navigation.section}
              settings={home.settings}
              onHome={onHome}
            />
            <NotificationCard
              description={`届いた連絡・申請・部員登録を知らせます。${ICON_BADGE_NOTE}`}
            />
          </>
        )}
        {view === 'presence' && <PresenceTab />}
        {view === 'hits' && (
          <HitsTab
            viewer={HIT_VIEWER}
            startDate={home.settings.hitStartDate ?? null}
            today={today}
          />
        )}
        {view === 'penalty' && (
          <PenaltyTab
            viewer={VIEWER}
            mine={null}
            today={today}
            doublingDays={home.settings.penaltyDoublingDays}
            onManage={() => openSection('penalties')}
          />
        )}
      </main>
      <TabBar
        current={view === 'officer' ? null : view}
        tabs={ADMIN_TABS}
        penaltyCount={0}
        onSelect={(next) => {
          navigation.select(next);
          onRefresh();
        }}
      />
      {navigation.menuOpen && (
        <OfficerMenu
          sections={OFFICER_SECTIONS}
          current={view === 'officer' ? navigation.section : null}
          counts={sectionCounts(counts)}
          onSelect={openSection}
          onClose={() => navigation.setMenuOpen(false)}
        />
      )}
    </>
  );
}
