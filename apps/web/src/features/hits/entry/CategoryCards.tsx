import {
  formatHitRate,
  HIT_CATEGORIES,
  HIT_CATEGORY_LABELS,
  sumTallies,
  type HitCategory,
  type HitTally,
} from '@kyudo/core';

function Figures({ tally }: { tally: HitTally }) {
  return (
    <>
      <b>{tally.shots ? `${tally.hits}/${tally.shots}` : '―'}</b>
      <small>{tally.shots ? formatHitRate(tally) : ' '}</small>
    </>
  );
}

/** その日の合計と、区分ごとの数（的中／射数）。区分を押して選ぶ */
export function CategoryCards({
  tallies,
  selected,
  onSelect,
}: {
  tallies: Record<HitCategory, HitTally>;
  selected: HitCategory;
  onSelect: (category: HitCategory) => void;
}) {
  return (
    <div className="hit-cards">
      <div className="hit-card hit-card-total">
        合計
        <Figures tally={sumTallies(Object.values(tallies))} />
      </div>
      {HIT_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          className="hit-card"
          aria-pressed={category === selected}
          onClick={() => onSelect(category)}
        >
          {HIT_CATEGORY_LABELS[category]}
          <Figures tally={tallies[category]} />
        </button>
      ))}
    </div>
  );
}
