import {
  BUCKET_UNIT_LABELS,
  clubHitSeries,
  formatHitRate,
  hitRate,
  type HitDay,
  type HitFilter,
  type StatsPeriod,
} from '@kyudo/core';
import { TimeSeriesChart } from '../charts/TimeSeriesChart.tsx';

/** 部全体の射数と的中率の推移 */
export function HitTrend({
  days,
  period,
  filter,
}: {
  days: readonly HitDay[];
  period: StatsPeriod;
  filter: HitFilter;
}) {
  const { unit, points } = clubHitSeries(days, period, filter);
  if (points.length === 0) return <p className="empty">この期間の記録はありません</p>;
  const per = BUCKET_UNIT_LABELS[unit];
  const axis = points.map((point) => ({ id: point.id, axis: [point.label] }));

  return (
    <section>
      <div className="figure-heading">
        <h3>{`図1\u3000${per}の射数`}</h3>
      </div>
      <TimeSeriesChart
        title={`${per}の射数`}
        kind="bar"
        unit="射"
        points={axis}
        series={[
          { id: 'shots', label: '射数', tone: 1, values: points.map((point) => point.shots) },
        ]}
      />
      <div className="figure-heading">
        <h3>{`図2\u3000${per}の的中率`}</h3>
      </div>
      <TimeSeriesChart
        title={`${per}の的中率`}
        kind="line"
        unit="%"
        points={axis}
        max={100}
        series={[
          {
            id: 'rate',
            label: '的中率',
            tone: 1,
            values: points.map((point) => Math.round((hitRate(point) ?? 0) * 100)),
          },
        ]}
      />
      <table className="data-table">
        <caption>{`表2\u3000${per}の数`}</caption>
        <thead>
          <tr>
            <th scope="col">期間</th>
            <th scope="col">射数</th>
            <th scope="col">的中</th>
            <th scope="col">的中率</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.id}>
              <th scope="row">{point.description}</th>
              <td>{point.shots}</td>
              <td>{point.hits}</td>
              <td>{formatHitRate(point)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
