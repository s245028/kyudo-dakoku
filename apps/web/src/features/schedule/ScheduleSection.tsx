import { addDays, groupSchedule, scheduleLabel, type ScheduleRange } from '@kyudo/core';
import { useCallback } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { dateWithWeekday } from '../../lib/format.ts';
import { loadDirectory, loadEvents, loadSchedule, type StoredEvent } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { EventRow } from './EventRow.tsx';
import { ScheduleForm } from './ScheduleForm.tsx';

/** 過ぎた予定をさかのぼって出す日数 */
const HISTORY_DAYS = 30;

const period = ({ from, to }: ScheduleRange) =>
  from === to ? dateWithWeekday(from) : `${dateWithWeekday(from)}〜${dateWithWeekday(to)}`;

/** 一覧の1件。期間の予定か、行事 */
type Item = { from: string; to: string } & ({ range: ScheduleRange } | { event: StoredEvent });

/** 部全体の予定か、部員ごとの予定 */
export function ScheduleSection({
  scope,
  today,
  canEditPast,
}: {
  scope: 'club' | 'member';
  today: string;
  /** 過ぎた日の予定も変えられる人（主将と管理者）か */
  canEditPast: boolean;
}) {
  const since = canEditPast ? addDays(today, -HISTORY_DAYS) : today;
  const load = useCallback(async () => {
    const [entries, events, directory] = await Promise.all([
      loadSchedule(scope, since),
      scope === 'club' ? loadEvents(since) : [],
      scope === 'member' ? loadDirectory() : null,
    ]);
    const items: Item[] = [
      ...groupSchedule(entries).map((range) => ({ from: range.from, to: range.to, range })),
      ...events.map((event) => ({ from: event.date, to: event.date, event })),
    ].sort((a, b) => a.from.localeCompare(b.from));
    return { items, directory };
  }, [scope, since]);
  const { data, error, reload } = useRemote(load);
  const action = useAction();
  const run = (name: string, params: object) => action.run(name, params, reload);
  const nameOf = (memberId: string | null) =>
    memberId === null
      ? '全員'
      : (data?.directory?.find((member) => member.id === memberId)?.name ?? '不明');

  const rangeRow = (range: ScheduleRange) => (
    <li className="list-row" key={range.ids[0]}>
      <span>
        <strong>
          {period(range)} {scheduleLabel(range.kind, range.memberId)}
        </strong>
        <small className="sub">
          {nameOf(range.memberId)}
          {range.memo && `・${range.memo}`}
        </small>
      </span>
      <ConfirmButton
        label="削除"
        className="small secondary"
        disabled={action.sending}
        onConfirm={() => void run('schedule-delete', { ids: range.ids })}
      />
    </li>
  );
  const list = (items: Item[], empty: string) => (
    <ul className="list">
      {!data && !error && <li className="empty">読み込み中…</li>}
      {data && items.length === 0 && <li className="empty">{empty}</li>}
      {items.map((item) =>
        'range' in item ? (
          rangeRow(item.range)
        ) : (
          <EventRow
            key={item.event.id}
            stored={item.event}
            today={today}
            sending={action.sending}
            run={run}
          />
        ),
      )}
    </ul>
  );
  const items = data?.items ?? [];
  const past = items.filter((item) => item.to < today);
  const members = data?.directory?.filter(
    (member) => member.status === 'active' || member.status === 'retired',
  );

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      <ScheduleForm
        members={scope === 'member' ? (members ?? []) : undefined}
        today={today}
        earliest={canEditPast ? undefined : today}
        sending={action.sending}
        run={run}
      />
      <h3>これからの予定</h3>
      {list(
        items.filter((item) => item.to >= today),
        'ありません',
      )}
      {past.length > 0 && (
        <details className="past">
          <summary>
            過ぎた予定（{HISTORY_DAYS}日前から・{past.length}件）
          </summary>
          <p className="hint">
            過ぎた日の予定を変えたときは、「出欠」でその日の出欠を計算し直してください。
          </p>
          {list(past, 'ありません')}
        </details>
      )}
    </>
  );
}
