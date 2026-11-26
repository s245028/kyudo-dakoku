import { TABS, type TabId } from './tabs.ts';

type TabBarProps = {
  current: TabId;
  tabs: readonly TabId[];
  penaltyCount: number;
  onSelect: (tab: TabId) => void;
};

export function TabBar({ current, tabs, penaltyCount, onSelect }: TabBarProps) {
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
          {id === 'penalty' && penaltyCount > 0 && <span className="badge">{penaltyCount}</span>}
        </button>
      ))}
    </nav>
  );
}
