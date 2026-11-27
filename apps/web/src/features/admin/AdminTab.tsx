import { useState } from 'react';
import type { Home } from '../../lib/home.ts';
import { AttendanceSection } from './AttendanceSection.tsx';
import { ExceptionSection } from './ExceptionSection.tsx';
import { LineupSection } from '../lineup/LineupSection.tsx';
import { ExportSection } from './ExportSection.tsx';
import { NoticeSection } from './NoticeSection.tsx';
import { RosterSection } from './RosterSection.tsx';
import { SettingsSection } from './SettingsSection.tsx';
import { YearlySection } from './YearlySection.tsx';

const SECTIONS = {
  notices: '連絡',
  lineup: '立ち順',
  roster: '名簿',
  exceptions: '臨時変更',
  attendance: '出欠',
  settings: '設定',
  yearly: '代替わり',
  export: '書き出し',
} as const;
type SectionId = keyof typeof SECTIONS;

type AdminTabProps = {
  today: string;
  viewerIsAdmin: boolean;
  pendingNotices: number;
  onHome: (home: Home) => void;
};

/** 主将と管理者の管理画面 */
export function AdminTab({ today, viewerIsAdmin, pendingNotices, onHome }: AdminTabProps) {
  // 承認待ちがあれば、開いてすぐ連絡の一覧を出す
  const [section, setSection] = useState<SectionId>(pendingNotices > 0 ? 'notices' : 'roster');

  return (
    <>
      <div className="section-menu">
        {(Object.keys(SECTIONS) as SectionId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={id === section ? 'small' : 'small secondary'}
            aria-pressed={id === section}
            onClick={() => setSection(id)}
          >
            {SECTIONS[id]}
            {id === 'notices' && pendingNotices > 0 && ` ${pendingNotices}`}
          </button>
        ))}
      </div>
      {section === 'notices' && <NoticeSection today={today} onHome={onHome} />}
      {section === 'lineup' && <LineupSection today={today} />}
      {section === 'roster' && <RosterSection viewerIsAdmin={viewerIsAdmin} onHome={onHome} />}
      {section === 'exceptions' && <ExceptionSection today={today} />}
      {section === 'attendance' && <AttendanceSection today={today} />}
      {section === 'settings' && <SettingsSection onHome={onHome} />}
      {section === 'yearly' && <YearlySection today={today} onHome={onHome} />}
      {section === 'export' && <ExportSection today={today} />}
    </>
  );
}
