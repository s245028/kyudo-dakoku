import { toPracticeDate } from '@kyudo/core';
import { useState } from 'react';
import { Header } from './components/Header.tsx';
import { TabBar } from './components/TabBar.tsx';
import type { TabId } from './components/tabs.ts';
import { LazyAdminTab } from './features/admin/LazyAdminTab.tsx';
import { PenaltyTab } from './features/penalties/PenaltyTab.tsx';
import { PresenceTab } from './features/presence/PresenceTab.tsx';
import { NotificationCard } from './features/profile/NotificationCard.tsx';
import { logOutAdmin } from './lib/adminAuth.ts';
import type { AdminHome, Home } from './lib/home.ts';

const ADMIN_TABS: TabId[] = ['admin', 'presence', 'penalty'];
const VIEWER = { memberId: null, officer: true, admin: true };

/** 管理者の画面。打刻はせず、管理・在室・罰を使う。 */
export function AdminScreen({
  home,
  now,
  onHome,
}: {
  home: AdminHome;
  now: Date;
  onHome: (home: Home) => void;
}) {
  const [tab, setTab] = useState<TabId>('admin');
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
            <LazyAdminTab
              today={today}
              viewerIsAdmin
              pendingNotices={home.pendingNotices ?? 0}
              onHome={onHome}
            />
            <NotificationCard description="出欠の連絡やコマ変更の申請が届いたときに知らせます。" />
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
        noticeCount={home.pendingNotices ?? 0}
        onSelect={setTab}
      />
    </>
  );
}
