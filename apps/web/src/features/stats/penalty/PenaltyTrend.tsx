import { BUCKET_UNIT_LABELS, runningTotal, shortDate, type PenaltyStats } from '@kyudo/core';
import { useState } from 'react';
import { TimeSeriesChart, type ChartPoint } from '../charts/TimeSeriesChart.tsx';
import { signed } from '../format.ts';

const KINDS = { bar: '棒グラフ', line: '折れ線', total: '累計' };
const UNIT_HEADINGS: Record<PenaltyStats['unit'], string> = { day: '日', week: '週', month: '月' };
/** 週の区切りが少なければ、軸に始まりと終わりの両方を出す */
const MAX_WEEKS_WITH_RANGE = 6;
const SERIES = [
  { id: 'added', label: 'つけた', tone: 1 },
  { id: 'done', label: '消化した', tone: 2 },
] as const;

function toPoints({ trend, unit }: Pick<PenaltyStats, 'trend' | 'unit'>): ChartPoint[] {
  const showRange = unit === 'week' && trend.length <= MAX_WEEKS_WITH_RANGE;
  return trend.map(({ from, to, label }) => ({
    id: from,
    axis: showRange && from !== to ? [`${shortDate(from)}〜`, shortDate(to)] : [label],
  }));
}

/** つけた数と消化した数の推移。下の表は、グラフと同じ数を出す */
export function PenaltyTrend({ trend, unit }: Pick<PenaltyStats, 'trend' | 'unit'>) {
  const [kind, setKind] = useState<keyof typeof KINDS>('bar');
  const cumulative = kind === 'total';
  const series = SERIES.map((item) => {
    const values = trend.map((bucket) => bucket[item.id]);
    return { ...item, values: cumulative ? runningTotal(values) : values };
  });
  const [added, done] = series.map((item) => item.values) as [number[], number[]];
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const title = cumulative ? '罰の数の累計' : `${BUCKET_UNIT_LABELS[unit]}の罰の数`;

  return (
    <section>
      <div className="figure-heading">
        <h3>{`図1\u3000${title}`}</h3>
        <select
          aria-label="グラフの種類"
          value={kind}
          onChange={(event) => setKind(event.target.value as keyof typeof KINDS)}
        >
          {Object.entries(KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <TimeSeriesChart
        title={title}
        kind={kind === 'bar' ? 'bar' : 'line'}
        unit="個"
        points={toPoints({ trend, unit })}
        series={series}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{UNIT_HEADINGS[unit]}</th>
            {series.map((item) => (
              <th key={item.id} scope="col">
                {item.label}
              </th>
            ))}
            <th scope="col">差</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((bucket, index) => (
            <tr key={bucket.from}>
              <th scope="row">{bucket.description}</th>
              <td>{added[index]}</td>
              <td>{done[index]}</td>
              <td>{signed(added[index]! - done[index]!)}</td>
            </tr>
          ))}
        </tbody>
        {!cumulative && (
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              <td>{sum(added)}</td>
              <td>{sum(done)}</td>
              <td>{signed(sum(added) - sum(done))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
