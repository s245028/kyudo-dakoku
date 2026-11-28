import { toClockTime } from '@kyudo/core';
import { useEffect } from 'react';
import { callFunction } from '../../lib/api.ts';
import { useChanges } from '../../lib/useChanges.ts';
import { useRemote } from '../../lib/useRemote.ts';

type Present = { member_id: string; name: string; since: string };

const loadPresence = () => callFunction<Present[]>('presence');

export function PresenceTab() {
  const { data, error, reload } = useRemote(loadPresence);

  // 誰かが打刻したら読み直す。画面に戻ってきたときも読み直す
  const changes = useChanges('presence');
  useEffect(() => {
    if (changes > 0) void reload();
  }, [changes, reload]);

  return (
    <>
      <div className="count-heading">
        <h2>いま道場にいる人</h2>
        <strong>{data?.length ?? '—'}</strong>
        <span>人</span>
      </div>
      <p className="form-error" role="alert">
        {error}
      </p>
      <ul className="list">
        {!data && !error && <li className="empty">読み込み中…</li>}
        {data?.length === 0 && <li className="empty">いま道場にいる人はいません</li>}
        {data?.map((present) => (
          <li className="list-row" key={present.member_id}>
            <span>{present.name}</span>
            <span>{toClockTime(new Date(present.since))}〜</span>
          </li>
        ))}
      </ul>
      <button type="button" className="secondary" onClick={() => void reload()}>
        更新
      </button>
    </>
  );
}
