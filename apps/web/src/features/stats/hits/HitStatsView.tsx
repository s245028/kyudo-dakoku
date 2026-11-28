import { hitOverview, type HitFilter, type StatsPeriod } from '@kyudo/core';
import { useState } from 'react';
import { ChoiceRow } from '../../../components/ChoiceRow.tsx';
import { useChanges } from '../../../lib/useChanges.ts';
import { FilterSelect, HitSelect } from '../../hits/HitSelect.tsx';
import { useRankingData } from '../../hits/ranking/useRankingData.ts';
import { TARGET_OPTIONS, type Target } from '../../hits/targets.ts';
import { HitMembers } from './HitMembers.tsx';
import { HitSummary } from './HitSummary.tsx';
import { HitTrend } from './HitTrend.tsx';

const VIEWS = { trend: '推移', member: '部員別' };

/** 部全体の的中の集計。見るだけで、直すのは「的中」タブでする */
export function HitStatsView({
  period,
  previous,
}: {
  period: StatsPeriod;
  /** 比べる相手の期間 */
  previous: StatsPeriod;
}) {
  const changes = useChanges('hits');
  const from = previous.from < period.from ? previous.from : period.from;
  const { data, error, reload } = useRankingData(from, period.to, changes);
  const [target, setTarget] = useState<Target>('all');
  const [filter, setFilter] = useState<HitFilter>('all');
  const [view, setView] = useState<keyof typeof VIEWS>('trend');

  const members =
    data?.directory.filter((member) => target === 'all' || member.gender === target) ?? [];
  const ids = new Set(members.map((member) => member.id));
  const days = data?.days.filter((day) => ids.has(day.memberId)) ?? [];
  const inPeriod = days.filter((day) => day.date >= period.from && day.date <= period.to);

  return (
    <>
      <div className="hit-selects">
        <HitSelect label="対象" options={TARGET_OPTIONS} value={target} onChange={setTarget} />
        <FilterSelect value={filter} onChange={setFilter} />
      </div>
      <p className="form-error" role="alert">
        {error}
      </p>
      {!data && !error && <p className="empty">読み込み中…</p>}
      {data && (
        <>
          <HitSummary
            period={period}
            previous={previous}
            now={hitOverview(days, period, filter)}
            before={hitOverview(days, previous, filter)}
            members={
              members.filter((member) => member.status === 'active' || member.status === 'retired')
                .length
            }
          />
          <ChoiceRow label="表示する内容" options={VIEWS} value={view} onChange={setView} />
          {view === 'trend' && <HitTrend days={inPeriod} period={period} filter={filter} />}
          {view === 'member' && <HitMembers days={inPeriod} filter={filter} members={members} />}
          <ol className="stats-notes">
            <li>的中率は、的中数の合計を射数の合計で割った値。</li>
            <li>「練習」は射込みと自練の合計。</li>
            <li>「―」は、記録がないか、比べる期間の記録がないことを示す。</li>
          </ol>
        </>
      )}
      <button type="button" className="secondary" onClick={() => void reload()}>
        読み直す
      </button>
    </>
  );
}
