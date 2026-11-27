import {
  listParticipants,
  PART_LABELS,
  PARTS,
  practiceParts,
  weekdayOf,
  type Part,
} from '@kyudo/core';
import { useCallback, useEffect, useState } from 'react';
import { dateWithWeekday } from '../../lib/format.ts';
import { loadLineupDay } from '../../lib/lineupQueries.ts';
import { watchPresence } from '../../lib/presenceChannel.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { LineupEditor } from './LineupEditor.tsx';
import { ParticipantSummary } from './ParticipantSummary.tsx';

const SATURDAY = 6;

/** 今日の参加者の確認と、立ち順づくり */
export function LineupSection({ today }: { today: string }) {
  const load = useCallback(() => loadLineupDay(today), [today]);
  const { data, error, reload } = useRemote(load);
  const [chosen, setChosen] = useState<Part | null>(null);

  // 打刻があったら、参加者の在室と遅刻を読み直す
  useEffect(() => watchPresence(() => void reload()), [reload]);

  const participants = data ? listParticipants({ date: today, ...data }) : [];
  const scheduled = data ? practiceParts(today, data.rules, data.exceptions) : [];
  const parts = PARTS.filter(
    (part) =>
      scheduled.includes(part) ||
      participants.some((entry) => entry.part === part) ||
      data?.lineups.some((lineup) => lineup.part === part),
  );
  const joiningIn = (part: Part) =>
    participants.filter((entry) => entry.part === part && entry.status !== 'absent').length;
  const current = chosen && parts.includes(chosen) ? chosen : parts[0];

  return (
    <>
      <div className="toolbar">
        <button type="button" className="small secondary" onClick={() => void reload()}>
          読み直す
        </button>
      </div>
      <p className="form-error" role="alert">
        {error}
      </p>
      <h3>{dateWithWeekday(today)}の参加者</h3>
      {!data && !error && <p className="empty">読み込み中…</p>}
      {data && parts.length === 0 && <p className="empty">今日は練習日ではありません</p>}
      {parts.length > 1 && (
        <div className="part-menu">
          {parts.map((part) => (
            <button
              key={part}
              type="button"
              className={part === current ? 'small' : 'small secondary'}
              aria-pressed={part === current}
              onClick={() => setChosen(part)}
            >
              {PART_LABELS[part]}（{joiningIn(part)}人）
            </button>
          ))}
        </div>
      )}
      {/* 区分を切り替えても、編集中の内容が残るように隠すだけにする */}
      {data &&
        parts.map((part) => {
          const inPart = participants.filter((entry) => entry.part === part);
          return (
            <div key={part} hidden={part !== current}>
              <ParticipantSummary participants={inPart} />
              <LineupEditor
                date={today}
                part={part}
                participants={inPart}
                members={data.members}
                saved={data.lineups.find((lineup) => lineup.part === part) ?? null}
                defaultFormat={weekdayOf(today) === SATURDAY ? 'groups' : 'targets'}
                onSaved={reload}
              />
            </div>
          );
        })}
    </>
  );
}
