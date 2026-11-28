import {
  EVENT_MAX_SHOTS,
  EVENT_MEMO_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  type PracticeEvent,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import type { RunAction } from '../../lib/useAction.ts';

/** 行事の日の名前・時刻・射数・内容。`saved` があれば、その行事を直す */
export function EventForm({
  saved,
  today,
  earliest,
  sending,
  run,
}: {
  saved?: { date: string; event: PracticeEvent };
  today: string;
  /** 指定できるいちばん前の日。過ぎた日も変えられる人は、指定なし */
  earliest: string | undefined;
  sending: boolean;
  /** 保存できたら true */
  run: RunAction;
}) {
  const [message, setMessage] = useState('');
  const event = saved?.event;

  async function submit(submitted: FormEvent<HTMLFormElement>) {
    submitted.preventDefault();
    const form = submitted.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    setMessage('');
    if (!(await run('event-save', saved ? { ...input, date: saved.date } : input))) return;
    if (!saved) form.reset();
    setMessage('保存しました');
  }

  return (
    <form className="form schedule-form" onSubmit={(submitted) => void submit(submitted)}>
      {!saved && (
        <>
          <p className="sub">
            行事の日は、全員がこの時刻で出欠を判定します。曜日の練習や全員の休みより優先し、練習のない日に入れると練習日になります。
          </p>
          <label>
            日付
            <input type="date" name="date" defaultValue={today} min={earliest} required />
          </label>
        </>
      )}
      <label>
        行事の名前
        <input
          name="title"
          defaultValue={event?.title}
          maxLength={EVENT_TITLE_MAX_LENGTH}
          placeholder="例：年末大射会、例会"
          required
        />
      </label>
      <label>
        集合時刻（遅刻の基準）
        <input type="time" name="deadline" defaultValue={event?.deadline} required />
      </label>
      <div className="date-range">
        <label>
          開始
          <input type="time" name="startTime" defaultValue={event?.startTime} required />
        </label>
        <label>
          終了（任意）
          <input type="time" name="endTime" defaultValue={event?.endTime ?? ''} />
        </label>
      </div>
      <label>
        引く射数（任意）
        <span className="unit-input">
          <input
            type="number"
            inputMode="numeric"
            name="shots"
            min={1}
            max={EVENT_MAX_SHOTS}
            defaultValue={event?.shots ?? ''}
          />
          射
        </span>
      </label>
      <label>
        内容（任意。部員の画面に出ます）
        <textarea name="memo" defaultValue={event?.memo} maxLength={EVENT_MEMO_MAX_LENGTH} />
      </label>
      <button type="submit" disabled={sending}>
        {saved ? 'この内容で保存' : '行事を追加する'}
      </button>
      <p className="form-message" role="status">
        {message}
      </p>
    </form>
  );
}
