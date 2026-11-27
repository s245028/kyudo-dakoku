import type { OfficerArea } from '@kyudo/core';
import { AdminTab, type AdminTabProps } from '../admin/AdminTab.tsx';
import { NoticeSection } from '../admin/NoticeSection.tsx';
import { SectionMenu } from '../admin/SectionMenu.tsx';
import type { SectionId } from '../admin/sections.ts';
import { LineupSection } from '../lineup/LineupSection.tsx';
import { StatsSection } from '../stats/StatsSection.tsx';

const VICE_SECTIONS: readonly SectionId[] = ['notices', 'stats'];

export type OfficerTabProps = AdminTabProps & { area: OfficerArea };

/** 役職のある人の画面。役職によって出すものが違う */
export function OfficerTab({ area, ...admin }: OfficerTabProps) {
  if (area === 'lineup') return <LineupSection />;
  if (area === 'admin') return <AdminTab {...admin} />;

  const section = VICE_SECTIONS.includes(admin.section) ? admin.section : 'notices';
  return (
    <>
      <SectionMenu ids={VICE_SECTIONS} current={section} onSelect={admin.onSection} />
      {section === 'stats' ? (
        <StatsSection today={admin.today} />
      ) : (
        <NoticeSection today={admin.today} onHome={admin.onHome} readOnly />
      )}
    </>
  );
}
