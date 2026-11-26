import { useCallback, useState } from 'react';
import { loadAttendance, loadRoster } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { AttendanceRow } from './AttendanceRow.tsx';
import { NightlyStatus } from './NightlyStatus.tsx';

export function AttendanceSection({ today }: { today: string }) {
  const [date, setDate] = useState(today);

  return (
    <>
      <div className="form">
        <label>
          日付
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => event.target.value && setDate(event.target.value)}
          />
        </label>
      </div>
      {/* 日付を変えたら読み込み直す */}
      <AttendanceList key={date} date={date} />
      <NightlyStatus />
    </>
  );
}

function AttendanceList({ date }: { date: string }) {
  const load = useCallback(async () => {
    const [members, entries] = await Promise.all([loadRoster(), loadAttendance(date)]);
    return entries.map((entry) => ({
      ...entry,
      name: members.find((member) => member.id === entry.memberId)?.name ?? '不明',
    }));
  }, [date]);
  const { data, error, reload } = useRemote(load);
  const action = useAction();
  const [message, setMessage] = useState('');
  const run = (name: string, params: object) => action.run(name, { date, ...params }, reload);

  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={action.sending}
        onClick={() => {
          setMessage('');
          void action.run<{ count: number }>('admin-rejudge', { date }, async ({ count }) => {
            await reload();
            setMessage(`${count}人分を判定しました`);
          });
        }}
      >
        この日を判定し直す
      </button>
      <p className="form-message" role="status">
        {message}
      </p>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      <ul className="list">
        {!data && !error && <li className="empty">読み込み中…</li>}
        {data?.length === 0 && <li className="empty">この日の出欠はありません</li>}
        {data?.map((entry) => (
          <AttendanceRow key={entry.memberId} entry={entry} sending={action.sending} run={run} />
        ))}
      </ul>
    </>
  );
}
