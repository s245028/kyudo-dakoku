import type { JoinDay, NoticeDay } from '@kyudo/core';
import { useState } from 'react';
import { useAction } from '../../lib/useAction.ts';
import type { Home } from '../../lib/home.ts';
import { PracticeDayRow } from './PracticeDayRow.tsx';

/** はじめに出す日数。残りはボタンで開く */
const COLLAPSED_DAYS = 3;

type UpcomingDaysCardProps = {
  retired: boolean;
  noticeDays: NoticeDay[];
  /** 引退した人の、参加の登録の対象になる日 */
  joinDays: JoinDay[];
  noticeLeadMinutes: number;
  onChanged: (home: Home) => void;
};

/** これからの練習日。欠席・遅刻の連絡と、引退した人の参加の登録をする。 */
export function UpcomingDaysCard(props: UpcomingDaysCardProps) {
  const { retired, noticeDays, joinDays, noticeLeadMinutes, onChanged } = props;
  const [expanded, setExpanded] = useState(false);
  const action = useAction();
  const days = retired ? joinDays : noticeDays;
  const visible = expanded ? days : days.slice(0, COLLAPSED_DAYS);

  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, ({ home }) => onChanged(home));

  return (
    <section className="card practice-days">
      <h3>{retired ? '参加する練習日' : '出欠の連絡'}</h3>
      <p className="hint">
        欠席・遅刻の連絡は集合の{noticeLeadMinutes}
        分前までに送り、主将の承認を受けます。過ぎると連絡遅れになります。
        {retired &&
          `引退した人は、参加を登録した日だけ遅刻・欠席を判定します。登録は集合時刻まで、取り消しは集合の${noticeLeadMinutes}分前までです。`}
      </p>
      <p className="form-error" role="alert">
        {action.error}
      </p>
      {days.length === 0 && <p className="empty">対象の練習日はありません</p>}
      <ul>
        {visible.map((day) => (
          <PracticeDayRow
            key={day.date}
            day={day}
            join={joinDays.find((candidate) => candidate.date === day.date)}
            notice={noticeDays.find((candidate) => candidate.date === day.date)}
            sending={action.sending}
            run={run}
          />
        ))}
      </ul>
      {days.length > COLLAPSED_DAYS && (
        <button type="button" className="link-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? '閉じる' : `ほかの練習日も見る（あと${days.length - COLLAPSED_DAYS}日）`}
        </button>
      )}
    </section>
  );
}
