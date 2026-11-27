import { rangeLabel, type PenaltyAmounts, type StatsPeriod } from '@kyudo/core';
import { signed } from '../format.ts';

const NONE = '―';

/** 期間の合計と、比べる期間との差 */
export function PenaltySummary({
  period,
  previous,
  totals,
  before,
}: {
  period: StatsPeriod;
  previous: StatsPeriod;
  totals: PenaltyAmounts;
  /** 比べる期間の数。記録がなければ null */
  before: Pick<PenaltyAmounts, 'added' | 'done'> | null;
}) {
  const withYear = period.from.slice(0, 4) !== previous.from.slice(0, 4);

  return (
    <table className="data-table summary-table">
      <caption>{'表1　概況（単位：個）'}</caption>
      <thead>
        <tr>
          <th scope="col">項目</th>
          <th scope="col">{rangeLabel(period, withYear)}</th>
          <th scope="col">{rangeLabel(previous, withYear)}</th>
          <th scope="col">増減</th>
        </tr>
      </thead>
      <tbody>
        {(['added', 'done'] as const).map((key) => (
          <tr key={key}>
            <th scope="row">{key === 'added' ? 'つけた' : '消化した'}</th>
            <td className="main-value">{totals[key]}</td>
            <td>{before ? before[key] : NONE}</td>
            <td>{before ? signed(totals[key] - before[key]) : NONE}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">残り（今日）</th>
          <td className="main-value">{totals.remaining}</td>
          <td>{NONE}</td>
          <td>{NONE}</td>
        </tr>
      </tbody>
    </table>
  );
}
