import type { JoinDay, KomaRequestDay, NoticeDay } from '@kyudo/core';
import { useState } from 'react';
import { useAction } from '../../lib/useAction.ts';
import type { Home } from '../../lib/home.ts';
import { PracticeDayRow } from './PracticeDayRow.tsx';

/** はじめに出す日数。下の項目が送らずに見えるように、次の1日だけにする。残りはボタンで開く */
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
  const visible = expanded ? days : days.slice(0, COLLAPSED_DAYS);

  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, ({ home }) => onChanged(home));

  return (
    <section className="section practice-days">
      <h3>{retired ? '参加する練習日' : '欠席・遅刻の連絡'}</h3>
      <p className="hint">
        {retired
          ? `参加の登録は集合時刻まで。取り消しと欠席・遅刻の連絡は集合の${noticeLeadMinutes}分前までで、過ぎた連絡は連絡遅れになります。`
          : `締め切りは集合の${noticeLeadMinutes}分前。過ぎた連絡は連絡遅れになり、コマ変更は申請できません。`}
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
            komaDay={komaDays.find((candidate) => candidate.date === day.date)}
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
