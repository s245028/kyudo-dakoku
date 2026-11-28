import {
  formatHitRate,
  HIT_CATEGORY_LABELS,
  categoriesOf,
  metricValue,
  rankDescending,
  totalOf,
  totalsByMember,
  type HitDay,
  type HitFilter,
  type MemberHits,
} from '@kyudo/core';
import { useState } from 'react';
import type { DirectoryEntry } from '../../../lib/queries.ts';
import { RankTable } from '../RankTable.tsx';
import { DailyMatrix } from './DailyMatrix.tsx';
import { MemberBars } from './MemberBars.tsx';

const BAR_METRICS = { rate: '的中率', shots: '射数' };
const COLUMNS = { days: '日数', shots: '射数', hits: '的中', rate: '的中率' };

/** 区分ごとの内訳 */
function Breakdown({ days, filter }: { days: readonly HitDay[]; filter: HitFilter }) {
  return (
    <ul className="hit-breakdown">
      {categoriesOf(filter).map((category) => {
        const tally = totalOf(days, category);
        return (
          <li key={category}>
            <span>{HIT_CATEGORY_LABELS[category]}</span>
            <span>
              {tally.shots}射 {tally.hits}中（{formatHitRate(tally)}）
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 部員ごとの数。縦棒、並べ替えられる表、日ごとの一覧の順 */
export function HitMembers({
  days,
  filter,
  members,
}: {
  days: readonly HitDay[];
  filter: HitFilter;
  /** 対象の部員。記録のない在籍中の部員も含める */
  members: readonly DirectoryEntry[];
}) {
  const [metric, setMetric] = useState<keyof typeof BAR_METRICS>('rate');
  const memberOf = (id: string) => members.find((member) => member.id === id);
  const byName = totalsByMember(days, filter)
    .filter((total) => memberOf(total.memberId))
    .sort((a, b) => memberOf(a.memberId)!.name.localeCompare(memberOf(b.memberId)!.name, 'ja'));
  const recorded = new Set(byName.map((total) => total.memberId));
  const missing = members.filter(
    (member) =>
      (member.status === 'active' || member.status === 'retired') && !recorded.has(member.id),
  );
  const sorted = rankDescending(byName, (total: MemberHits) => metricValue(total, metric));
  const ordered = sorted.map((total) => ({
    id: total.memberId,
    name: memberOf(total.memberId)!.name,
    value:
      metric === 'rate' ? Math.round(metricValue(total, metric) * 100) : metricValue(total, metric),
  }));
  const title = `部員ごとの${BAR_METRICS[metric]}`;

  return (
    <section>
      {ordered.length === 0 && <p className="empty">この期間の記録はありません</p>}
      {ordered.length > 0 && (
        <>
          <div className="figure-heading">
            <h3>{`図1\u3000${title}${metric === 'rate' ? '（%）' : ''}`}</h3>
            <select
              aria-label="グラフの数"
              value={metric}
              onChange={(event) => setMetric(event.target.value as keyof typeof BAR_METRICS)}
            >
              {Object.entries(BAR_METRICS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <MemberBars title={title} bars={ordered} max={metric === 'rate' ? 100 : 0} />
          <RankTable
            caption={'表2　部員ごとの的中'}
            columns={COLUMNS}
            initial="shots"
            formats={{ rate: (value) => `${(value * 100).toFixed(1)}%` }}
            rows={byName.map((total) => ({
              id: total.memberId,
              name: memberOf(total.memberId)!.name,
              values: {
                days: total.days,
                shots: total.shots,
                hits: total.hits,
                rate: metricValue(total, 'rate'),
              },
              detail: (
                <Breakdown
                  days={days.filter((day) => day.memberId === total.memberId)}
                  filter={filter}
                />
              ),
            }))}
          />
          <DailyMatrix days={days} filter={filter} members={ordered} />
        </>
      )}
      {missing.length > 0 && (
        <details className="disclosure">
          <summary>記録のない部員（{missing.length}人）</summary>
          <p className="hint">{missing.map((member) => member.name).join('、')}</p>
        </details>
      )}
    </section>
  );
}
