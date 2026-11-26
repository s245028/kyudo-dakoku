import { PART_LABELS } from '@kyudo/core';
import { totalRemaining, type HomeView } from '../../lib/home.ts';

export function TodayCard({
  view,
  onShowPenalties,
}: {
  view: HomeView;
  onShowPenalties: () => void;
}) {
  const total = totalRemaining(view.penalties);

  return (
    <div className="today-card">
      <div>
        <p className="today-label">
          {view.plan ? `今日の集合（${PART_LABELS[view.plan.part]}）` : '今日の練習'}
        </p>
        <p className="today-value">{view.plan ? view.plan.deadline : 'なし'}</p>
      </div>
      <button
        type="button"
        className={total ? 'today-penalty' : 'today-penalty today-penalty-clear'}
        onClick={onShowPenalties}
      >
        <span className="today-label">あなたの罰</span>
        <span className="today-value">{total ? `${total}個` : 'なし'}</span>
      </button>
    </div>
  );
}
