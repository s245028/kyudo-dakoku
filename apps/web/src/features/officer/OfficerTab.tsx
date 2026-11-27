import type { OfficerArea } from '@kyudo/core';
import { AdminTab, type AdminTabProps } from '../admin/AdminTab.tsx';
import { NoticeSection } from '../admin/NoticeSection.tsx';
import { LineupSection } from '../lineup/LineupSection.tsx';

export type OfficerTabProps = AdminTabProps & { area: OfficerArea };

/** 役職のある人の画面。役職によって出すものが違う */
export function OfficerTab({ area, ...admin }: OfficerTabProps) {
  if (area === 'lineup') return <LineupSection />;
  if (area === 'notices') {
    return <NoticeSection today={admin.today} onHome={admin.onHome} readOnly />;
  }
  return <AdminTab {...admin} />;
}
