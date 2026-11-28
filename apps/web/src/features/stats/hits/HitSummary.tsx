import {
  formatHitRate,
  hitRate,
  rangeLabel,
  type HitOverview,
  type StatsPeriod,
} from '@kyudo/core';
import { signed } from '../format.ts';

const NONE = '―';
const grouped = (count: number) => count.toLocaleString('ja-JP');
const ONE_DECIMAL = 10;

/** 的中率の差（ポイント）。小数1桁にそろえる */
function rateDifference(now: HitOverview, before: HitOverview): string {
  const points =
    Math.round(((hitRate(now) ?? 0) - (hitRate(before) ?? 0)) * 100 * ONE_DECIMAL) / ONE_DECIMAL;
  return `${signed(points)}ポイント`;
}

/** 部全体の数と、比べる期間との差 */
export function HitSummary({
  period,
  previous,
  now,
  before,
  members,
}: {
  period: StatsPeriod;
  previous: StatsPeriod;
  /** 記録がなければ null */
  now: HitOverview | null;
  before: HitOverview | null;
  /** 対象の在籍している部員の数 */
  members: number;
}) {
  const withYear = period.from.slice(0, 4) !== previous.from.slice(0, 4);
  const current = now ?? { shots: 0, hits: 0, recorders: 0 };
  const compare = (value: (overview: HitOverview) => number) =>
    now && before ? signed(value(now) - value(before)) : NONE;

  return (
    <table className="data-table summary-table">
      <caption>{'表1　部全体の概況'}</caption>
      <thead>
        <tr>
          <th scope="col">項目</th>
          <th scope="col">{rangeLabel(period, withYear)}</th>
          <th scope="col">{rangeLabel(previous, withYear)}との差</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">射数</th>
          <td className="main-value">{grouped(current.shots)}</td>
          <td>{compare((overview) => overview.shots)}</td>
        </tr>
        <tr>
          <th scope="row">的中数</th>
          <td className="main-value">{grouped(current.hits)}</td>
          <td>{compare((overview) => overview.hits)}</td>
        </tr>
        <tr>
          <th scope="row">的中率</th>
          <td className="main-value">{formatHitRate(current)}</td>
          <td>{now && before ? rateDifference(now, before) : NONE}</td>
        </tr>
        <tr>
          <th scope="row">記録した人</th>
          <td className="main-value">
            {current.recorders}/{members}人
          </td>
          <td>{compare((overview) => overview.recorders)}</td>
        </tr>
      </tbody>
    </table>
  );
}
