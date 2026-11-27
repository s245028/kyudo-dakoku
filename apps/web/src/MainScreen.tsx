import {
  canAdminister,
  canManagePenalties,
  PART_LABELS,
  ROLE_LABELS,
  toClockTime,
} from '@kyudo/core';
import { useState } from 'react';
import { Header } from './components/Header.tsx';
import { TabBar } from './components/TabBar.tsx';
import type { TabId } from './components/tabs.ts';
import { LazyAdminTab } from './features/admin/LazyAdminTab.tsx';
import { PenaltyTab } from './features/penalties/PenaltyTab.tsx';
import { PresenceTab } from './features/presence/PresenceTab.tsx';
import { ProfileTab } from './features/profile/ProfileTab.tsx';
import { ScanTab } from './features/scan/ScanTab.tsx';
import { describeHome, totalRemaining, type Home, type HomeData } from './lib/home.ts';

type MainScreenProps = {
  home: HomeData;
  now: Date;
  initialTab: TabId;
  error: string | null;
  onHome: (home: Home) => void;
  onRefresh: () => void;
};

const MEMBER_TABS: TabId[] = ['scan', 'presence', 'penalty', 'me'];
const CAPTAIN_TABS: TabId[] = [...MEMBER_TABS, 'admin'];

export function MainScreen(props: MainScreenProps) {
  const { home, now, error, onHome, onRefresh } = props;
  const [selected, setTab] = useState<TabId>(props.initialTab);
  const view = describeHome(home, now);
  const { member } = home;
  const captain = canAdminister(member);
  // 管理画面を開いたまま主将でなくなったら、打刻の画面を出す
  const tab = selected === 'admin' && !captain ? 'scan' : selected;

  function select(next: TabId) {
    setTab(next);
    onRefresh();
  }

  const todayText = view.plan
    ? `今日：${PART_LABELS[view.plan.part]}（${view.plan.deadline}までに入室）`
    : view.retired
      ? '引退：今日は参加登録なし（判定しません）'
      : '今日は練習日ではありません';
  const state = !member.approved
    ? { label: '承認待ち', active: false }
    : view.inRoomSince
      ? { label: `在室中 ${toClockTime(view.inRoomSince)}〜`, active: true }
      : { label: '不在', active: false };

  return (
    <>
      <Header
        title={`${member.name} さん`}
        subtitle={todayText}
        role={member.role === 'member' ? undefined : ROLE_LABELS[member.role]}
        state={state}
      />
      <main className="app-main">
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {/* 打刻タブは、結果の表示を残すために隠すだけにする */}
        <div hidden={tab !== 'scan'}>
          <ScanTab
            home={home}
            view={view}
            active={tab === 'scan'}
            onHome={onHome}
            onShowPenalties={() => select('penalty')}
          />
        </div>
        {tab === 'presence' && <PresenceTab />}
        {tab === 'penalty' && (
          <PenaltyTab
            viewer={{
              memberId: member.id,
              officer: canManagePenalties(member),
              admin: member.role === 'admin',
            }}
            mine={view.penalties}
            today={view.today}
            doublingDays={home.settings.penaltyDoublingDays}
            onHome={onHome}
          />
        )}
        {tab === 'me' && <ProfileTab home={home} onHome={onHome} />}
        {tab === 'admin' && (
          <LazyAdminTab
            today={view.today}
            viewerIsAdmin={member.role === 'admin'}
            pendingNotices={home.pendingNotices ?? 0}
            onHome={onHome}
          />
        )}
      </main>
      <TabBar
        current={tab}
        tabs={captain ? CAPTAIN_TABS : MEMBER_TABS}
        penaltyCount={totalRemaining(view.penalties)}
        noticeCount={captain ? (home.pendingNotices ?? 0) : 0}
        onSelect={select}
      />
    </>
  );
}
