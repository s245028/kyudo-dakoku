import { describePosition, PART_LABELS, type LineupFormat, type Part } from '@kyudo/core';
import { useEffect, useState } from 'react';
import { callFunction } from '../../lib/api.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { LineupBoard } from './LineupBoard.tsx';

type PublishedLineup = {
  part: Part;
  format: LineupFormat;
  groups: { id: string; name: string }[][];
};

const loadPublished = () => callFunction<PublishedLineup[]>('published_lineups');

/** 公開された今日の立ち順。自分の場所を先に出し、板は開いて見る。公開していなければ何も出さない。 */
export function PublishedLineups({ memberId, active }: { memberId: string; active: boolean }) {
  const { data, reload } = useRemote(loadPublished);
  const [opened, setOpened] = useState<Part | null>(null);

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

  if (!data?.length) return null;
  const lineups = data.map((lineup) => ({
    ...lineup,
    position: describePosition(
      lineup.format,
      lineup.groups.map((group) => group.map(({ id }) => id)),
      memberId,
    ),
  }));
  // 自分が入っている区分を先に出す
  lineups.sort((a, b) => Number(a.position === null) - Number(b.position === null));

  return (
    <section className="section lineup-today">
      <h3>今日の立ち順</h3>
      <ul>
        {lineups.map(({ part, format, groups, position }) => (
          <li key={part}>
            <div className="lineup-summary">
              <p className={position ? 'lineup-mine' : 'lineup-mine lineup-mine-none'}>
                <span>{PART_LABELS[part]}</span>
                {position ? `あなたは ${position}` : 'あなたは入っていません'}
              </p>
              <button
                type="button"
                className="small secondary"
                aria-expanded={opened === part}
                onClick={() => setOpened(opened === part ? null : part)}
              >
                {opened === part ? '閉じる' : '板を見る'}
              </button>
            </div>
            {opened === part && (
              <LineupBoard format={format} columns={groups} highlighted={memberId} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
