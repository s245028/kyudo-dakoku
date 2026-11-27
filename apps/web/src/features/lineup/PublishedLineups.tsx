import { lineupColumnName, PART_LABELS, type LineupFormat, type Part } from '@kyudo/core';
import { useEffect } from 'react';
import { callFunction } from '../../lib/api.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { LineupBoard } from './LineupBoard.tsx';

type PublishedLineup = {
  part: Part;
  format: LineupFormat;
  groups: { id: string; name: string }[][];
};

const loadPublished = () => callFunction<PublishedLineup[]>('published_lineups');

/** 公開された今日の立ち順。公開していなければ何も出さない。 */
export function PublishedLineups({ memberId, active }: { memberId: string; active: boolean }) {
  const { data, reload } = useRemote(loadPublished);

  // 打刻タブに戻ったときと、アプリに戻ったときに読み直す
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (!document.hidden) void reload();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [active, reload]);

  return data?.map((lineup) => {
    const column = lineup.groups.findIndex((group) => group.some(({ id }) => id === memberId));
    const position = lineup.groups[column]?.findIndex(({ id }) => id === memberId) ?? -1;

    return (
      <section className="card lineup-card" key={lineup.part}>
        <h3>今日の立ち順（{PART_LABELS[lineup.part]}）</h3>
        {column >= 0 && (
          <p className="lineup-mine">
            あなたは {lineupColumnName(lineup.format, column)}の{position + 1}番目
          </p>
        )}
        <LineupBoard format={lineup.format} columns={lineup.groups} highlighted={memberId} />
      </section>
    );
  });
}
