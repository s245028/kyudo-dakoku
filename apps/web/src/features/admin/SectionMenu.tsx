import { SECTIONS, type SectionId } from './sections.ts';

/** 役職の画面の項目の切り替え。承認を待つ数は赤丸で出す */
export function SectionMenu({
  ids,
  current,
  counts = {},
  onSelect,
}: {
  ids: readonly SectionId[];
  current: SectionId;
  counts?: Partial<Record<SectionId, number>>;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <div className="section-menu">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className={id === current ? 'small' : 'small secondary'}
          aria-pressed={id === current}
          onClick={() => onSelect(id)}
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
  );
}
