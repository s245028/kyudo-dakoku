import {
  ATTENDANCE_GROUP_LABELS,
  ATTENDANCE_GROUPS,
  groupAttendance,
  type AttendanceGroup,
} from '@kyudo/core';
import { useCallback, useState } from 'react';
import { ChoiceRow } from '../../components/ChoiceRow.tsx';
import { callAction } from '../../lib/api.ts';
import { loadAttendance, loadExceptionsOn, loadRoster } from '../../lib/queries.ts';
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
      <AttendanceList key={date} date={date} isToday={date === today} />
      <NightlyStatus />
    </>
  );
}

function AttendanceList({ date, isToday }: { date: string; isToday: boolean }) {
  const load = useCallback(async () => {
    // 今日の分は、読む前に今の状態にする。できなくても、前に判定した内容は見せる
    const current =
      !isToday ||
      (await callAction('admin-refresh-attendance').then(
        () => true,
        () => false,
      ));
    const [members, entries, exceptions] = await Promise.all([
      loadRoster(),
      loadAttendance(date),
      loadExceptionsOn(date),
    ]);
    return {
      current,
      exceptions,
      entries: entries.map((entry) => ({
        ...entry,
        name: members.find((member) => member.id === entry.memberId)?.name ?? '不明',
      })),
    };
  }, [date, isToday]);
  const { data, error, reload } = useRemote(load);
  const action = useAction();
  const [message, setMessage] = useState('');
  const [group, setGroup] = useState<AttendanceGroup>('unnotified');
  const run = (name: string, params: object) => action.run(name, { date, ...params }, reload);
  const groups = data && groupAttendance(data.entries, data.exceptions);
  /** 人数を添えた、分け方の名前 */
  const labels = Object.fromEntries(
    ATTENDANCE_GROUPS.map((key) => {
      const count = groups?.[key].reduce((total, section) => total + section.entries.length, 0);
      return [key, `${ATTENDANCE_GROUP_LABELS[key]} ${count ?? 0}`];
    }),
  ) as Record<AttendanceGroup, string>;

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
      {data && !data.current && (
        <p className="form-error">今の状態にできませんでした。前に判定した内容を表示しています。</p>
      )}
      {!data && !error && <p className="empty">読み込み中…</p>}
      {data?.entries.length === 0 && <p className="empty">この日の出欠はありません</p>}
      {groups && data.entries.length > 0 && (
        <>
          <ChoiceRow label="表示する人" options={labels} value={group} onChange={setGroup} />
          {groups[group].length === 0 && <p className="empty">該当する人はいません</p>}
          {groups[group].map((section) => (
            <section key={section.label}>
              <h4 className="group-heading">
                {section.label}（{section.entries.length}人）
              </h4>
              <ul className="list">
                {section.entries.map((entry) => (
                  <AttendanceRow
                    key={entry.memberId}
                    entry={entry}
                    sending={action.sending}
                    run={run}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
