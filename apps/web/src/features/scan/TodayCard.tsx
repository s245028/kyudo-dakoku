import { describeEvent, PART_LABELS } from '@kyudo/core';
import { totalRemaining, type HomeView } from '../../lib/home.ts';

export function TodayCard({
  view,
  onShowPenalties,
  onShowNotices,
}: {
  view: HomeView;
  onShowPenalties: () => void;
  /** 連絡の欄へ移る。承認前は指定しない */
  onShowNotices?: (() => void) | undefined;
}) {
  const total = totalRemaining(view.penalties);
  const event = view.plan?.event;

  return (
    <div className="today-card">
      <div>
        <p className="today-label">
          {view.plan
            ? `今日の集合（${event?.title ?? PART_LABELS[view.plan.part]}）`
            : '今日の練習'}
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
      {event && (
        <div className="today-event">
          <p>{describeEvent(event)}</p>
          {event.memo && <p>{event.memo}</p>}
        </div>
      )}
      {onShowNotices && (
        <button type="button" className="secondary today-notice" onClick={onShowNotices}>
          {view.retired ? '参加する練習日を選ぶ' : '欠席・遅刻を連絡する'}
        </button>
      )}
    </div>
  );
}
