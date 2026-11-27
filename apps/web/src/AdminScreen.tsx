import { toPracticeDate } from '@kyudo/core';
import { Header } from './components/Header.tsx';
import { TabBar } from './components/TabBar.tsx';
import type { TabId } from './components/tabs.ts';
import { LazyOfficerTab } from './features/officer/LazyOfficerTab.tsx';
import { PenaltyTab } from './features/penalties/PenaltyTab.tsx';
import { PresenceTab } from './features/presence/PresenceTab.tsx';
import { NotificationCard } from './features/profile/NotificationCard.tsx';
import { logOutAdmin } from './lib/adminAuth.ts';
import type { AdminHome, Home } from './lib/home.ts';
import { useOfficerNavigation } from './lib/useOfficerNavigation.ts';

const ADMIN_TABS: TabId[] = ['admin', 'presence', 'penalty'];
const VIEWER = { memberId: null, officer: true, admin: true };

/** 管理者の画面。打刻はせず、管理・在室・罰を使う。 */
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
  const { tab, section, setSection, select } = useOfficerNavigation('admin', pending);
  const today = toPracticeDate(now);

  return (
    <>
      <Header title="管理者" subtitle="開発用のログイン" role="管理者" />
      <main className="app-main">
        <div className="toolbar">
          <button type="button" className="small secondary" onClick={() => void logOutAdmin()}>
            ログアウト
          </button>
        </div>
        {tab === 'admin' && (
          <>
            <LazyOfficerTab
              area="admin"
              today={today}
              viewerIsAdmin
              section={section}
              onSection={(next) => {
                setSection(next);
                onRefresh();
              }}
              pendingNotices={pending.notices}
              pendingMembers={pending.members}
              onHome={onHome}
            />
            <NotificationCard description="出欠の連絡、コマ変更の申請、新しい部員の登録が届いたときに知らせます。" />
          </>
        )}
        {tab === 'presence' && <PresenceTab />}
        {tab === 'penalty' && (
          <PenaltyTab
            viewer={VIEWER}
            mine={null}
            today={today}
            doublingDays={home.settings.penaltyDoublingDays}
            onHome={onHome}
          />
        )}
      </main>
      <TabBar
        current={tab}
        tabs={ADMIN_TABS}
        penaltyCount={0}
        officerCount={pending.notices + pending.members}
        onSelect={select}
      />
    </>
  );
}
