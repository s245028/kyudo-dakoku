import { describeEvent, NOTICE_KIND_LABELS, PART_LABELS, type NoticeState } from '@kyudo/core';
import { totalRemaining, type HomeView } from '../../lib/home.ts';
import { APPROVAL_LABELS, NOTICE_STATE_LABELS } from '../../lib/noticeLabels.ts';

export function TodayCard({
  view,
  noticeLeadMinutes,
  onShowPenalties,
  onShowNotices,
}: {
  view: HomeView;
  noticeLeadMinutes: number;
  onShowPenalties: () => void;
  /** 「自分」の連絡の欄へ移る。承認前は指定しない */
  onShowNotices?: (() => void) | undefined;
}) {
  const total = totalRemaining(view.penalties);
  const event = view.plan?.event;
  // 今日出した連絡と申請の状態は、打刻する前にも分かるようにする
  const notice = view.noticeDays.find((day) => day.date === view.today)?.notice;
  const koma = view.komaDays.find((day) => day.date === view.today)?.request;
  const sent: { label: string; state: NoticeState; text: string }[] = [
    ...(notice
      ? [
          {
            label: `${NOTICE_KIND_LABELS[notice.kind]}の連絡`,
            state: notice.state,
            text: NOTICE_STATE_LABELS[notice.state],
          },
        ]
      : []),
    ...(koma
      ? [{ label: 'コマ変更の申請', state: koma.state, text: APPROVAL_LABELS[koma.state] }]
      : []),
  ];

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
      {sent.map(({ label, state, text }) => (
        <p key={label} className="today-sent">
          今日の{label}
          <span className={`notice-state notice-state-${state}`}>{text}</span>
        </p>
      ))}
      {onShowNotices && (
        <button type="button" className="today-notice" onClick={onShowNotices}>
          {view.retired
            ? '参加する練習日を選ぶ'
            : `欠席・遅刻の連絡は集合${noticeLeadMinutes}分前まで`}
        </button>
      )}
    </div>
  );
}
