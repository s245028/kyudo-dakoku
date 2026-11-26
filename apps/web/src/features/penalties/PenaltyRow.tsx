import type { ReactNode } from 'react';
import { shortDate } from '../../lib/format.ts';
import type { CountedPenalty } from '../../lib/home.ts';

type PenaltyRowProps = {
  penalty: CountedPenalty;
  mine: boolean;
  /** やることの一覧 */
  children: ReactNode;
};

export function PenaltyRow({ penalty, mine, children }: PenaltyRowProps) {
  return (
    <li className={mine ? 'penalty penalty-mine' : 'penalty'}>
      <span className="penalty-date">{shortDate(penalty.date)}</span>
      <div>
        <p>
          <strong>{penalty.name}</strong>
          <span className="penalty-student">{penalty.studentNo}</span>
        </p>
        <p className="penalty-reason">
          {penalty.reason}
          {penalty.memo && <span className="penalty-memo">（{penalty.memo}）</span>}
        </p>
      </div>
      <p className="penalty-count">
        <strong>罰{penalty.remaining}個</strong>
        <small>あと{penalty.daysToDouble}日で残りが2倍</small>
      </p>
      <div className="penalty-tasks">{children}</div>
      {penalty.paid > 0 && <p className="penalty-paid">{penalty.paid}個 消化済み</p>}
    </li>
  );
}
