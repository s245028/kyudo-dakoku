import type { OfficerSection } from '@kyudo/core';
import { useEffect, useRef } from 'react';
import { SECTION_GROUPS, SECTION_LABELS } from './sections.ts';

/** 左から出る、役職の画面の項目の一覧。対応を待つ数は赤丸で出す */
export function OfficerMenu({
  sections,
  current,
  counts,
  onSelect,
  onClose,
}: {
  sections: readonly OfficerSection[];
  /** 開いている項目。役職の画面でないときは null */
  current: OfficerSection | null;
  counts: Partial<Record<OfficerSection, number>>;
  onSelect: (section: OfficerSection) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);

  // 開いたときに、読み上げと操作の位置を一覧へ移す
  useEffect(() => panel.current?.focus(), []);

  useEffect(() => {
    const closeByKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeByKey);
    return () => window.removeEventListener('keydown', closeByKey);
  }, [onClose]);

  return (
    <div className="drawer-layer">
      <button type="button" className="drawer-shade" aria-label="一覧を閉じる" onClick={onClose} />
      <nav className="drawer" aria-label="役職の項目" tabIndex={-1} ref={panel}>
        <h2>役職の項目</h2>
        {SECTION_GROUPS.map((group) => {
          const shown = group.sections.filter((section) => sections.includes(section));
          if (shown.length === 0) return null;
          return (
            <section key={group.label}>
              <h3>{group.label}</h3>
              <ul className="list">
                {shown.map((section) => (
                  <li key={section}>
                    <button
                      type="button"
                      className="drawer-item"
                      aria-current={section === current ? 'page' : undefined}
                      onClick={() => onSelect(section)}
                    >
                      {SECTION_LABELS[section]}
                      {!!counts[section] && (
                        <span className="menu-badge" aria-label={`対応待ち${counts[section]}`}>
                          {counts[section]}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
    </div>
  );
}
