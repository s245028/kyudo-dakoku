import {
  canAdminister,
  canCorrectHits,
  canManagePenalties,
  officerSections,
  PART_LABELS,
  type OfficerSection,
  roleLabels,
  toClockTime,
  waitingCount,
} from '@kyudo/core';
import { useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { TabBar } from './components/TabBar.tsx';
import type { TabId } from './components/tabs.ts';
import { HitsTab } from './features/hits/HitsTab.tsx';
import { LazyOfficerTab } from './features/officer/LazyOfficerTab.tsx';
import { OfficerMenu } from './features/officer/OfficerMenu.tsx';
import { PendingList } from './features/officer/PendingList.tsx';
import { pendingItems, sectionCounts } from './features/officer/pending.ts';
import { PenaltyTab } from './features/penalties/PenaltyTab.tsx';
import { PresenceTab } from './features/presence/PresenceTab.tsx';
import { ProfileTab } from './features/profile/ProfileTab.tsx';
import { ScanTab } from './features/scan/ScanTab.tsx';
import { currentBrowser } from './lib/browser.ts';
import { startDraftSync } from './lib/hitSync.ts';
import { useAppBadge } from './lib/useAppBadge.ts';
import { describeHome, totalRemaining, type Home, type HomeData } from './lib/home.ts';
import { useOfficerNavigation, type ViewId } from './lib/useOfficerNavigation.ts';
import { useUnassignedPenalties } from './lib/useUnassignedPenalties.ts';

type MainScreenProps = {
  home: HomeData;
  now: Date;
  initialTab: TabId;
  error: string | null;
  onHome: (home: Home) => void;
  onRefresh: () => void;
};

const MEMBER_TABS: TabId[] = ['scan', 'presence', 'hits', 'penalty', 'me'];

export function MainScreen(props: MainScreenProps) {
  const { home, now, error, onHome, onRefresh } = props;
  const view = describeHome(home, now);
  const { member } = home;
  const sections = officerSections(member);
  const officer = sections.length > 0;
  const administers = canAdminister(member);
  const pending = {
    notices: administers ? (home.pendingNotices ?? 0) : 0,
    members: administers ? (home.pendingMembers ?? 0) : 0,
  };
  const navigation = useOfficerNavigation(props.initialTab, sections, pending);
  // 役職の画面を開いたまま役職がなくなったら、打刻の画面を出す
  const tab = navigation.view === 'officer' && !officer ? 'scan' : navigation.view;
  const managesPenalties = canManagePenalties(member);
  const tasks = useUnassignedPenalties(
    managesPenalties,
    view.today,
    home.settings.penaltyDoublingDays,
    home,
  );
  const counts = { ...pending, tasks: tasks ?? 0 };
  const waiting = waitingCount(member, counts);
  // 罰を数え終えるまでは、アイコンの数字を変えない
  useAppBadge(tasks === null ? null : waiting);
  // 通信が切れている間に入れた的中は、開き直したときにも送る
  useEffect(() => startDraftSync(), []);

  // 画面を切り替えるたびに、対応を待っている数も読み直す
  function select(next: ViewId) {
    navigation.select(next);
    onRefresh();
  }
  function openSection(section: OfficerSection) {
    navigation.openSection(section);
    onRefresh();
  }

  const todayText = view.plan
    ? `今日：${view.plan.event?.title ?? PART_LABELS[view.plan.part]}（${view.plan.deadline}までに入室）`
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
        role={roleLabels(member).join('・') || undefined}
        state={state}
        menu={
          officer
            ? {
                waiting,
                open: navigation.menuOpen,
                onOpen: () => navigation.setMenuOpen(true),
              }
            : undefined
        }
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
          <PendingList
            items={pendingItems(counts).filter((item) => sections.includes(item.section))}
            onOpen={openSection}
          />
          <ScanTab
            home={home}
            view={view}
            active={tab === 'scan'}
            onHome={onHome}
            onShowPenalties={() => select('penalty')}
          />
        </div>
        {tab === 'presence' && <PresenceTab />}
        {tab === 'hits' && (
          <HitsTab
            viewer={{
              memberId: member.id,
              approved: member.approved,
              canCorrect: canCorrectHits(member),
            }}
            startDate={home.settings.hitStartDate ?? null}
            today={view.today}
          />
        )}
        {tab === 'penalty' && (
          <PenaltyTab
            viewer={{ memberId: member.id, admin: member.isAdmin }}
            mine={view.penalties}
            today={view.today}
            doublingDays={home.settings.penaltyDoublingDays}
            onManage={managesPenalties ? () => openSection('penalties') : undefined}
          />
        )}
        {tab === 'me' && <ProfileTab home={home} onHome={onHome} />}
        {tab === 'officer' && (
          <LazyOfficerTab
            today={view.today}
            viewer={{ memberId: member.id, administers, isAdmin: member.isAdmin }}
            section={navigation.section}
            settings={home.settings}
            onHome={onHome}
          />
        )}
      </main>
      <TabBar
        current={tab === 'officer' ? null : tab}
        tabs={MEMBER_TABS}
        penaltyCount={totalRemaining(view.penalties)}
        onSelect={select}
      />
      {navigation.menuOpen && (
        <OfficerMenu
          sections={sections}
          current={tab === 'officer' ? navigation.section : null}
          counts={sectionCounts(counts)}
          onSelect={openSection}
          onClose={() => navigation.setMenuOpen(false)}
        />
      )}
    </>
  );
}
