import { previousPenaltyAmounts, summarizePenaltyStats, type StatsPeriod } from '@kyudo/core';
import { useState } from 'react';
import { ChoiceRow } from '../../../components/ChoiceRow.tsx';
import { loadPenaltyRows, loadTaskRows, toPenaltyRecord } from '../../../lib/penaltyQueries.ts';
import { loadRoster, loadSettings } from '../../../lib/queries.ts';
import { useRemote } from '../../../lib/useRemote.ts';
import { MemberTable } from './MemberTable.tsx';
import { PenaltySummary } from './PenaltySummary.tsx';
import { PenaltyTrend } from './PenaltyTrend.tsx';
import { ReasonTable } from './ReasonTable.tsx';

const VIEWS = { trend: '推移', reason: '理由', member: '部員' };

async function loadPenaltyData() {
  const [penalties, tasks, members, settings] = await Promise.all([
    loadPenaltyRows(),
    loadTaskRows(),
    loadRoster(),
    loadSettings(),
  ]);
  return {
    records: penalties.map((row) => toPenaltyRecord(row, tasks)),
    members,
    doublingDays: settings.penaltyDoublingDays,
  };
}

/** 罰の統計。記録は一度だけ読み、期間を変えるたびに手元で数え直す。 */
export function PenaltyStatsView({
  period,
  previous,
  today,
}: {
  period: StatsPeriod;
  /** 比べる相手の期間 */
  previous: StatsPeriod;
  today: string;
}) {
  const { data, error, reload } = useRemote(loadPenaltyData);
  const [view, setView] = useState<keyof typeof VIEWS>('trend');
  const stats =
    data &&
    summarizePenaltyStats({
      records: data.records,
      period,
      today,
      doublingDays: data.doublingDays,
    });

  return (
    <>
      <p className="form-error" role="alert">
        {error}
      </p>
      {!stats && !error && <p className="empty">読み込み中…</p>}
      {data && stats && (
        <>
          <PenaltySummary
            period={period}
            previous={previous}
            totals={stats.totals}
            before={previousPenaltyAmounts(data.records, previous)}
          />
          <ChoiceRow label="表示する内容" options={VIEWS} value={view} onChange={setView} />
          {view === 'trend' && <PenaltyTrend trend={stats.trend} unit={stats.unit} />}
          {view === 'reason' && <ReasonTable reasons={stats.byReason} />}
          {view === 'member' && <MemberTable byMember={stats.byMember} members={data.members} />}
          <ol className="stats-notes">
            <li>つけた数は、期間内の日付の罰の基本の数。取り消した罰は含まない。</li>
            <li>消化した数は、期間より前の罰の分も含む。</li>
            <li>残りは今日の時点の数。2倍になった分を含む。</li>
            <li>「―」は、比べる期間の記録がないことを示す。</li>
          </ol>
        </>
      )}
      <button type="button" className="secondary" onClick={() => void reload()}>
        読み直す
      </button>
    </>
  );
}
