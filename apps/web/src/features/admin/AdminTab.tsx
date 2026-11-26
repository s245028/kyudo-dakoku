import { useState } from 'react';
import type { Home } from '../../lib/home.ts';
import { AttendanceSection } from './AttendanceSection.tsx';
import { ExceptionSection } from './ExceptionSection.tsx';
import { RosterSection } from './RosterSection.tsx';
import { SettingsSection } from './SettingsSection.tsx';
import { YearlySection } from './YearlySection.tsx';

const SECTIONS = {
  roster: '名簿',
  exceptions: '臨時変更',
  attendance: '出欠',
  settings: '設定',
  yearly: '代替わり',
} as const;
type SectionId = keyof typeof SECTIONS;

/** 主将の管理画面 */
export function AdminTab({ today, onHome }: { today: string; onHome: (home: Home) => void }) {
  const [section, setSection] = useState<SectionId>('roster');

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
          </button>
        ))}
      </div>
      {section === 'roster' && <RosterSection onHome={onHome} />}
      {section === 'exceptions' && <ExceptionSection today={today} />}
      {section === 'attendance' && <AttendanceSection today={today} />}
      {section === 'settings' && <SettingsSection onHome={onHome} />}
      {section === 'yearly' && <YearlySection today={today} onHome={onHome} />}
    </>
  );
}
