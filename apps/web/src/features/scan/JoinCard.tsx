import { PART_LABELS, type JoinDay } from '@kyudo/core';
import { useState } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import { dateWithWeekday } from '../../lib/format.ts';
import type { Home } from '../../lib/home.ts';

/** 引退した人の、参加する練習日の登録 */
export function JoinCard({
  days,
  noticeLeadMinutes,
  onChanged,
}: {
  days: JoinDay[];
  noticeLeadMinutes: number;
  onChanged: (home: Home) => void;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function change(date: string, action: 'join' | 'unjoin') {
    setSending(date);
    setError('');
    try {
      const { home } = await callAction<{ home: Home }>(action, { date });
      onChanged(home);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSending(null);
    }
  }

  return (
    <section className="card join-card">
      <h3>参加する練習日</h3>
      <p className="hint">
        引退した人は、参加を登録した日だけ遅刻・欠席を判定します。登録は集合時刻まで、取り消しは集合の
        {noticeLeadMinutes}分前までです。
      </p>
      <p className="form-error" role="alert">
        {error}
      </p>
      {days.length === 0 && <p className="empty">登録できる練習日はありません</p>}
      <ul className="join-list">
        {days.map((day) => (
          <li key={day.date}>
            <span className="join-date">
              {dateWithWeekday(day.date)}
              <small>
                {day.deadline}集合・{PART_LABELS[day.part]}
              </small>
            </span>
            <span className="join-actions">
              {day.joined && <span className="join-status">参加予定</span>}
              {day.joined && day.canCancel && (
                <button
                  type="button"
                  className="small secondary"
                  disabled={sending !== null}
                  onClick={() => void change(day.date, 'unjoin')}
                >
                  取消
                </button>
              )}
              {!day.joined && day.canJoin && (
                <button
                  type="button"
                  className="small"
                  disabled={sending !== null}
                  onClick={() => void change(day.date, 'join')}
                >
                  参加する
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
