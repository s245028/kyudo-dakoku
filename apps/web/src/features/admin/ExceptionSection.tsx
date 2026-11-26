import { addDays, EXCEPTION_LABELS, toClockTime, toPracticeDate } from '@kyudo/core';
import { useCallback } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { dateWithWeekday, shortDate } from '../../lib/format.ts';
import { loadExceptionsSince, loadRoster } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { ExceptionForm } from './ExceptionForm.tsx';

/** 一覧にさかのぼって出す日数 */
const HISTORY_DAYS = 30;

function contactText(contactedAt: string): string {
  const at = new Date(contactedAt);
  return `連絡 ${shortDate(toPracticeDate(at))} ${toClockTime(at)}`;
}

export function ExceptionSection({ today }: { today: string }) {
  const load = useCallback(async () => {
    const [members, exceptions] = await Promise.all([
      loadRoster(),
      loadExceptionsSince(addDays(today, -HISTORY_DAYS)),
    ]);
    return { members, exceptions };
  }, [today]);
  const { data, error, reload } = useRemote(load);
  const action = useAction();
  const run = (name: string, params: object) => action.run(name, params, reload);
  const nameOf = (memberId: string | null) =>
    memberId === null
      ? '全員'
      : (data?.members.find((member) => member.id === memberId)?.name ?? '不明');

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      <h3>臨時変更を追加</h3>
      <ExceptionForm
        members={data?.members.filter((member) => member.approved) ?? []}
        today={today}
        sending={action.sending}
        run={run}
      />
      <p className="hint">
        当日の分は夜の判定に反映されます。過去の日を変えたときは「出欠」でその日を判定し直してください。
      </p>
      <h3>{HISTORY_DAYS}日前からの臨時変更</h3>
      <ul className="list">
        {!data && !error && <li className="empty">読み込み中…</li>}
        {data?.exceptions.length === 0 && <li className="empty">ありません</li>}
        {data?.exceptions.map((exception) => (
          <li className="list-row" key={exception.id}>
            <span>
              <strong>
                {dateWithWeekday(exception.date)} {EXCEPTION_LABELS[exception.kind]}
              </strong>
              <small className="sub">
                {nameOf(exception.memberId)}
                {exception.contactedAt && `・${contactText(exception.contactedAt)}`}
                {exception.memo && `・${exception.memo}`}
              </small>
            </span>
            <ConfirmButton
              label="削除"
              className="small secondary"
              disabled={action.sending}
              onConfirm={() => void run('admin-delete-exception', { exceptionId: exception.id })}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
