import {
  BUCKET_UNIT_LABELS,
  DAILY_TARGET_SHOTS,
  formatHitRate,
  hitRate,
  hitSeries,
  presetPeriod,
  totalOf,
  validatePeriod,
  type HitFilter,
  type StatsPeriod,
} from '@kyudo/core';
import { useCallback, useEffect, useState } from 'react';
import { loadMemberHitDays } from '../../../lib/hitQueries.ts';
import { useRemote } from '../../../lib/useRemote.ts';
import { TimeSeriesChart } from '../../stats/charts/TimeSeriesChart.tsx';
import { PeriodPicker, type PeriodChoice } from '../../stats/PeriodPicker.tsx';
import { FilterSelect } from '../HitSelect.tsx';

function Charts({
  memberId,
  period,
  filter,
  changes,
}: {
  memberId: string;
  period: StatsPeriod;
  filter: HitFilter;
  changes: number;
}) {
  const { from, to } = period;
  const load = useCallback(() => loadMemberHitDays(memberId, from, to), [memberId, from, to]);
  const { data, error, reload } = useRemote(load);
  useEffect(() => {
    if (changes > 0) void reload();
  }, [changes, reload]);

  if (!data) return <p className={error ? 'form-error' : 'empty'}>{error || '読み込み中…'}</p>;

  const { unit, points } = hitSeries(data, period, filter);
  const total = totalOf(data, filter);
  const axis = points.map((point) => ({ id: point.id, axis: [point.label] }));
  const per = BUCKET_UNIT_LABELS[unit];

  return (
    <>
      <p className="hit-total">
        <span>
          {total.shots}射 {total.hits}中
        </span>
        <strong>{formatHitRate(total)}</strong>
      </p>
      {points.length === 0 ? (
        <p className="empty">この期間の記録はありません</p>
      ) : (
        <>
          <h3>
            {`図1\u3000${per}の射数`}
            {unit === 'day' && `（点線は1日の目標${DAILY_TARGET_SHOTS}射）`}
          </h3>
          <TimeSeriesChart
            title={`${per}の射数`}
            kind="bar"
            unit="射"
            points={axis}
            goal={unit === 'day' ? DAILY_TARGET_SHOTS : undefined}
            series={[
              { id: 'shots', label: '射数', tone: 1, values: points.map((point) => point.shots) },
            ]}
          />
          <h3>{`図2\u3000${per}の的中率`}</h3>
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
            <caption>{`表1\u3000${per}の数`}</caption>
            <thead>
              <tr>
                <th scope="col">期間</th>
                <th scope="col">射数</th>
                <th scope="col">的中</th>
                <th scope="col">的中率</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.id}>
                  <th scope="row">{point.description}</th>
                  <td>{point.shots}</td>
                  <td>{point.hits}</td>
                  <td>{formatHitRate(point)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

/** 自分の射数と的中率の推移 */
export function AnalysisView({
  memberId,
  today,
  changes,
}: {
  memberId: string;
  today: string;
  changes: number;
}) {
  const [choice, setChoice] = useState<PeriodChoice>(() => ({
    preset: 'this_month',
    ...presetPeriod('this_month', today),
  }));
  const [filter, setFilter] = useState<HitFilter>('all');
  const period =
    choice.preset === 'custom'
      ? validatePeriod(choice.from, choice.to)
      : ({ ok: true, value: presetPeriod(choice.preset, today) } as const);

  return (
    <>
      <PeriodPicker today={today} choice={choice} onChange={setChoice} />
      <div className="hit-selects">
        <FilterSelect value={filter} onChange={setFilter} />
      </div>
      {period.ok ? (
        <Charts memberId={memberId} period={period.value} filter={filter} changes={changes} />
      ) : (
        <p className="form-error" role="alert">
          {period.message}
        </p>
      )}
    </>
  );
}
