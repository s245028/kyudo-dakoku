import { PUNCH_LABELS, toClockTime } from '@kyudo/core';
import type { HomeView } from '../../lib/home.ts';

/** 今日の自分の入退室の記録 */
export function TodayPunches({ punches }: { punches: HomeView['todayPunches'] }) {
  return (
    <section className="card punch-history">
      <h3>今日の入退室</h3>
      {punches.length === 0 ? (
        <p className="empty">まだ記録がありません</p>
      ) : (
        <ol>
          {punches.map((punch) => (
            <li key={`${punch.at.getTime()}-${punch.kind}`}>
              <time dateTime={punch.at.toISOString()}>{toClockTime(punch.at)}</time>
              <span className={punch.kind === 'in' ? 'punch-in' : 'punch-out'}>
                {PUNCH_LABELS[punch.kind]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
