import {
  hitRankingPeriods,
  minimumShots,
  rankHits,
  totalsByMember,
  type HitFilter,
} from '@kyudo/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { FilterSelect, HitSelect } from '../HitSelect.tsx';
import { TARGET_OPTIONS, type Target } from '../targets.ts';
import { MemberRecords } from './MemberRecords.tsx';
import { RankingTable } from './RankingTable.tsx';
import { useRankingData } from './useRankingData.ts';

/** 的中の順位。開いたときと選び直したときは、自分の行を画面の中央にする */
export function RankingView({
  ownId,
  canCorrect,
  startDate,
  today,
  changes,
}: {
  /** 管理者ログインは null */
  ownId: string | null;
  canCorrect: boolean;
  startDate: string;
  today: string;
  changes: number;
}) {
  const periods = hitRankingPeriods(startDate, today);
  const [periodId, setPeriodId] = useState('this_month');
  const [target, setTarget] = useState<Target>('all');
  const [filter, setFilter] = useState<HitFilter>('all');
  const [member, setMember] = useState<string | null>(null);
  const chosen = periods.find((candidate) => candidate.id === periodId) ?? periods[0]!;
  const { data, error, reload } = useRankingData(chosen.period.from, chosen.period.to, changes);

  const ownRow = useRef<HTMLTableRowElement>(null);
  /** 中央にし終えた表示。ほかの人の保存で読み直したときは、位置を動かさない */
  const centered = useRef('');
  const view = `${chosen.id}/${target}/${filter}`;
  const ready = data !== null;
  useLayoutEffect(() => {
    if (!ready || member || centered.current === view) return;
    centered.current = view;
    ownRow.current?.scrollIntoView({ block: 'center' });
  }, [ready, member, view]);

  const nameOf = (id: string) => data?.directory.find((entry) => entry.id === id)?.name ?? '不明';
  const selected = data?.directory.find((entry) => entry.id === member);

  if (selected && data) {
    return (
      <MemberRecords
        member={selected}
        periodLabel={chosen.label}
        period={chosen.period}
        own={selected.id === ownId}
        canCorrect={canCorrect}
        directory={data.directory}
        changes={changes}
        onBack={() => {
          setMember(null);
          // 戻ったときは、開き直したときと同じ位置にする
          centered.current = '';
          void reload();
        }}
      />
    );
  }

  const totals = data
    ? totalsByMember(data.days, filter)
        .filter(
          (total) =>
            target === 'all' ||
            data.directory.find((entry) => entry.id === total.memberId)?.gender === target,
        )
        // 順位も射数も同じ人は、名前の順
        .sort((a, b) => nameOf(a.memberId).localeCompare(nameOf(b.memberId), 'ja'))
    : [];
  const { ranked, unranked } = rankHits(totals, filter);
  const minimum = minimumShots(filter, 'rate');
  const table = { ownId, ownRow, nameOf, onSelect: setMember };

  return (
    <>
      <div className="hit-filters">
        <HitSelect
          label="期間"
          options={periods.map(({ id, label }) => ({ value: id, label }))}
          value={chosen.id}
          onChange={setPeriodId}
        />
        <HitSelect label="対象" options={TARGET_OPTIONS} value={target} onChange={setTarget} />
        <FilterSelect value={filter} onChange={setFilter} />
      </div>
      <p className="form-error" role="alert">
        {error}
      </p>
      {!ready && !error && <p className="empty">読み込み中…</p>}
      {ready && ranked.length === 0 && <p className="empty">{minimum}射以上の人はまだいません</p>}
      {ranked.length > 0 && <RankingTable caption="順位" rows={ranked} {...table} />}
      {unranked.length > 0 && (
        <>
          <h3>{minimum}射未満（順位なし）</h3>
          <RankingTable caption="順位なし" rows={unranked} {...table} />
        </>
      )}
      {ready && ownId && !totals.some((total) => total.memberId === ownId) && (
        <button type="button" className="secondary" onClick={() => setMember(ownId)}>
          自分の日ごとの記録を見る
        </button>
      )}
      <p className="hint">
        的中率は、的中数の合計を射数の合計で割った値です。「すべて」は期間の合計が40射以上、区分を絞ったときはその区分が12射以上の人に順位が付きます。「練習」は射込みと自練の合計です。名前を押すと日ごとの記録が開きます。
      </p>
    </>
  );
}
