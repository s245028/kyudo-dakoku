import type { Home } from '../../lib/home.ts';
import { LineupSection } from '../lineup/LineupSection.tsx';
import { AttendanceSection } from './AttendanceSection.tsx';
import { ExceptionSection } from './ExceptionSection.tsx';
import { ExportSection } from './ExportSection.tsx';
import { NoticeSection } from './NoticeSection.tsx';
import { RosterSection } from './RosterSection.tsx';
import { SECTIONS, type SectionId } from './sections.ts';
import { SettingsSection } from './SettingsSection.tsx';
import { YearlySection } from './YearlySection.tsx';

export type AdminTabProps = {
  today: string;
  viewerIsAdmin: boolean;
  /** 開いている項目。タブを移っても覚えておく */
  section: SectionId;
  onSection: (section: SectionId) => void;
  pendingNotices: number;
  pendingMembers: number;
  onHome: (home: Home) => void;
};

/** 主将と管理者の管理画面 */
export function AdminTab(props: AdminTabProps) {
  const { today, viewerIsAdmin, section, onSection, onHome } = props;
  const counts: Partial<Record<SectionId, number>> = {
    notices: props.pendingNotices,
    roster: props.pendingMembers,
  };

  return (
    <>
      <div className="section-menu">
        {(Object.keys(SECTIONS) as SectionId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={id === section ? 'small' : 'small secondary'}
            aria-pressed={id === section}
            onClick={() => onSection(id)}
          >
            {SECTIONS[id]}
            {!!counts[id] && (
              <span className="section-badge" aria-label={`承認待ち${counts[id]}件`}>
                {counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>
      {section === 'notices' && <NoticeSection today={today} onHome={onHome} />}
      {section === 'lineup' && <LineupSection />}
      {section === 'roster' && <RosterSection viewerIsAdmin={viewerIsAdmin} onHome={onHome} />}
      {section === 'exceptions' && <ExceptionSection today={today} />}
      {section === 'attendance' && <AttendanceSection today={today} />}
      {section === 'settings' && <SettingsSection onHome={onHome} />}
      {section === 'yearly' && <YearlySection today={today} onHome={onHome} />}
      {section === 'export' && <ExportSection today={today} />}
    </>
  );
}
