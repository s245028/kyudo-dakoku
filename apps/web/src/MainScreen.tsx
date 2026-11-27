import {
  canManagePenalties,
  officerArea,
  PART_LABELS,
  ROLE_LABELS,
  toClockTime,
} from '@kyudo/core';
import { Header } from './components/Header.tsx';
import { TabBar } from './components/TabBar.tsx';
import type { TabId } from './components/tabs.ts';
import { LazyOfficerTab } from './features/officer/LazyOfficerTab.tsx';
import { PenaltyTab } from './features/penalties/PenaltyTab.tsx';
import { PresenceTab } from './features/presence/PresenceTab.tsx';
import { ProfileTab } from './features/profile/ProfileTab.tsx';
import { ScanTab } from './features/scan/ScanTab.tsx';
import { currentBrowser } from './lib/browser.ts';
import { describeHome, totalRemaining, type Home, type HomeData } from './lib/home.ts';
import { useOfficerNavigation } from './lib/useOfficerNavigation.ts';

type MainScreenProps = {
  home: HomeData;
  now: Date;
  initialTab: TabId;
  error: string | null;
  onHome: (home: Home) => void;
  onRefresh: () => void;
};

const MEMBER_TABS: TabId[] = ['scan', 'presence', 'penalty', 'me'];
const OFFICER_TABS: TabId[] = [...MEMBER_TABS, 'admin'];

export function MainScreen(props: MainScreenProps) {
  const { home, now, error, onHome, onRefresh } = props;
  const view = describeHome(home, now);
  const { member } = home;
  const area = officerArea(member);
  const pending = {
    notices: area === 'admin' ? (home.pendingNotices ?? 0) : 0,
    members: area === 'admin' ? (home.pendingMembers ?? 0) : 0,
  };
  const navigation = useOfficerNavigation(props.initialTab, pending);
  // 役職の画面を開いたまま役職がなくなったら、打刻の画面を出す
  const tab = navigation.tab === 'admin' && !area ? 'scan' : navigation.tab;

  function select(next: TabId) {
    navigation.select(next);
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
        {currentBrowser() === 'line' && (
          <p className="notice">
            LINEの中で開いています。このままだと、ホーム画面のアプリやいつものブラウザでは未登録になります。「自分」タブの引き継ぎ番号で移してください。
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
        {tab === 'admin' && area && (
          <LazyOfficerTab
            area={area}
            today={view.today}
            viewerIsAdmin={member.role === 'admin'}
            section={navigation.section}
            // 項目を切り替えるたびに、承認待ちの数を読み直す
            onSection={(section) => {
              navigation.setSection(section);
              onRefresh();
            }}
            pendingNotices={pending.notices}
            pendingMembers={pending.members}
            onHome={onHome}
          />
        )}
      </main>
      <TabBar
        current={tab}
        tabs={area ? OFFICER_TABS : MEMBER_TABS}
        penaltyCount={totalRemaining(view.penalties)}
        officerCount={pending.notices + pending.members}
        onSelect={select}
      />
    </>
  );
}
