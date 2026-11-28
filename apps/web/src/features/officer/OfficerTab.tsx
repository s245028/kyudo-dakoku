import { DEFAULT_SETTINGS, type OfficerSection } from '@kyudo/core';
import type { Home, HomeData } from '../../lib/home.ts';
import { AppSettingsSection } from '../admin/AppSettingsSection.tsx';
import { AttendanceSection } from '../admin/AttendanceSection.tsx';
import { NoticeSection } from '../admin/NoticeSection.tsx';
import { PracticeTimesSection } from '../admin/PracticeTimesSection.tsx';
import { RosterSection } from '../admin/RosterSection.tsx';
import { YearlySection } from '../admin/YearlySection.tsx';
import { ExportSection } from '../export/ExportSection.tsx';
import { LineupSection } from '../lineup/LineupSection.tsx';
import { PenaltyManage } from '../penalties/PenaltyManage.tsx';
import { ScheduleSection } from '../schedule/ScheduleSection.tsx';
import { StatsSection } from '../stats/StatsSection.tsx';
import { SECTION_LABELS } from './sections.ts';

export type OfficerTabProps = {
  today: string;
  /** 見ている人と、できること。管理者ログインの `memberId` は null */
  viewer: { memberId: string | null; administers: boolean; isAdmin: boolean };
  section: OfficerSection;
  settings: HomeData['settings'];
  onHome: (home: Home) => void;
};

/** 役職のある人の画面。左上の3本線から項目を選ぶ */
export function OfficerTab(props: OfficerTabProps) {
  return (
    <>
      <h2 className="section-title">{SECTION_LABELS[props.section]}</h2>
      <SectionContent {...props} />
    </>
  );
}

function SectionContent({ section, today, viewer, settings, onHome }: OfficerTabProps) {
  switch (section) {
    case 'notices':
      return <NoticeSection today={today} onHome={onHome} readOnly={!viewer.administers} />;
    case 'lineup':
      return <LineupSection />;
    case 'attendance':
      return <AttendanceSection today={today} />;
    case 'penalties':
      return (
        <PenaltyManage
          viewer={{ memberId: viewer.memberId, admin: viewer.isAdmin }}
          today={today}
          doublingDays={settings.penaltyDoublingDays}
          leaderMultiplier={
            settings.leaderPenaltyMultiplier ?? DEFAULT_SETTINGS.leaderPenaltyMultiplier
          }
          onHome={onHome}
        />
      );
    case 'clubSchedule':
    case 'memberSchedule':
      return (
        <ScheduleSection
          // 部全体と部員ごとは、読み込み直して切り替える
          key={section}
          scope={section === 'clubSchedule' ? 'club' : 'member'}
          today={today}
          canEditPast={viewer.administers}
        />
      );
    case 'roster':
      return <RosterSection viewerIsAdmin={viewer.isAdmin} onHome={onHome} />;
    case 'stats':
      return <StatsSection today={today} />;
    case 'export':
      return <ExportSection today={today} canExportData={viewer.administers} />;
    case 'practiceTimes':
      return <PracticeTimesSection />;
    case 'appSettings':
      return <AppSettingsSection onHome={onHome} />;
    case 'yearly':
      return <YearlySection today={today} onHome={onHome} />;
  }
}
