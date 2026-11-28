import type { JoinDay, KomaRequestDay, NoticeDay } from '@kyudo/core';
import { useState } from 'react';
import { useAction } from '../../lib/useAction.ts';
import type { Home } from '../../lib/home.ts';
import { DeadlineRules } from './DeadlineRules.tsx';
import { PracticeDayRow } from './PracticeDayRow.tsx';

/**
 * はじめに出す日数。下の項目が送らずに見えるように、次の1日だけにする。
 * 連絡か申請を出した日は、この数に関係なく出す。残りはボタンで開く
 */
const COLLAPSED_DAYS = 1;

type UpcomingDaysCardProps = {
  retired: boolean;
  noticeDays: NoticeDay[];
  komaDays: KomaRequestDay[];
  /** 引退した人の、参加の登録の対象になる日 */
  joinDays: JoinDay[];
  noticeLeadMinutes: number;
  onChanged: (home: Home) => void;
};

/** これからの練習日。欠席・遅刻の連絡と、引退した人の参加の登録をする。 */
export function UpcomingDaysCard(props: UpcomingDaysCardProps) {
  const { retired, noticeDays, komaDays, joinDays, noticeLeadMinutes, onChanged } = props;
  const [expanded, setExpanded] = useState(false);
  const action = useAction();
  const days = retired ? joinDays : noticeDays;
  const hasSent = (date: string) =>
    noticeDays.some((day) => day.date === date && day.notice) ||
    komaDays.some((day) => day.date === date && day.request);
  const collapsed = days.filter((day, index) => index < COLLAPSED_DAYS || hasSent(day.date));
  const hidden = days.length - collapsed.length;
  const visible = expanded ? days : collapsed;

  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, ({ home }) => onChanged(home));

  return (
    <section className="practice-days">
      <h3>{retired ? '参加する練習日' : '欠席・遅刻の連絡'}</h3>
      <DeadlineRules retired={retired} noticeLeadMinutes={noticeLeadMinutes} />
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
            komaDay={komaDays.find((candidate) => candidate.date === day.date)}
            sending={action.sending}
            run={run}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="secondary" onClick={() => setExpanded(!expanded)}>
          {expanded ? '閉じる' : `ほかの練習日も見る（あと${hidden}日）`}
        </button>
      )}
    </section>
  );
}
