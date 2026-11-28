import type { OfficerSection } from '@kyudo/core';

export type PendingItem = {
  section: OfficerSection;
  label: string;
  count: number;
  unit: string;
};

/** 対応を待っているもの。打刻の画面の上に出し、押すとその項目を開く */
export function PendingList({
  items,
  onOpen,
}: {
  items: readonly PendingItem[];
  onOpen: (section: OfficerSection) => void;
}) {
  const waiting = items.filter((item) => item.count > 0);
  if (waiting.length === 0) return null;

  return (
    <ul className="list pending-list" aria-label="対応を待っているもの">
      {waiting.map((item) => (
        <li key={item.section}>
          <button type="button" className="pending-item" onClick={() => onOpen(item.section)}>
            <span>{item.label}</span>
            <strong>
              {item.count}
              {item.unit}
            </strong>
          </button>
        </li>
      ))}
    </ul>
  );
}
