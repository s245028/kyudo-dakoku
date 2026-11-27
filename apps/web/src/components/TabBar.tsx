import { TABS, type TabId } from './tabs.ts';

type TabBarProps = {
  current: TabId;
  tabs: readonly TabId[];
  penaltyCount: number;
  /** 承認を待っている連絡と部員の数 */
  officerCount: number;
  onSelect: (tab: TabId) => void;
};

export function TabBar({ current, tabs, penaltyCount, officerCount, onSelect }: TabBarProps) {
  const badges: Partial<Record<TabId, number>> = { penalty: penaltyCount, admin: officerCount };

  return (
    <nav className="tabbar">
      {tabs.map((id) => (
        <button
          key={id}
          type="button"
          className={id === current ? 'tab tab-current' : 'tab'}
          aria-current={id === current ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={TABS[id].icon} />
          </svg>
          {TABS[id].label}
          {!!badges[id] && <span className="badge">{badges[id]}</span>}
        </button>
      ))}
    </nav>
  );
}
