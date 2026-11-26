import { KOMA_KEYS, KOMA_LABELS, type Koma, type KomaKey } from '@kyudo/core';
import { useState } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import type { Home } from '../../lib/home.ts';

const DAYS: { label: string; fourth: KomaKey; fifth: KomaKey }[] = [
  { label: '月', fourth: 'mon4', fifth: 'mon5' },
  { label: '火', fourth: 'tue4', fifth: 'tue5' },
  { label: '木', fourth: 'thu4', fifth: 'thu5' },
];

const EMPTY = Object.fromEntries(KOMA_KEYS.map((key) => [key, false])) as Koma;

export function KomaForm({
  saved,
  locked,
  onSaved,
}: {
  saved: Koma | null;
  locked: boolean;
  onSaved: (home: Home) => void;
}) {
  /** 編集中の内容。編集していなければ null で、読み直した内容をそのまま表示する */
  const [draft, setDraft] = useState<Koma | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const koma = draft ?? saved ?? EMPTY;

  async function save() {
    setSending(true);
    setMessage('');
    try {
      const { home } = await callAction<{ home: Home }>('set-koma', { koma });
      onSaved(home);
      setDraft(null);
      setMessage('保存しました');
    } catch (cause) {
      setMessage(messageOf(cause));
    } finally {
      setSending(false);
    }
  }

  const checkbox = (key: KomaKey) => (
    <input
      type="checkbox"
      aria-label={KOMA_LABELS[key]}
      checked={koma[key]}
      disabled={locked}
      onChange={(event) => {
        setDraft({ ...koma, [key]: event.target.checked });
        setMessage('');
      }}
    />
  );

  return (
    <>
      <table className="koma">
        <thead>
          <tr>
            <th />
            <th>4コマ</th>
            <th>5コマ</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => (
            <tr key={day.label}>
              <th>{day.label}</th>
              <td>{checkbox(day.fourth)}</td>
              <td>{checkbox(day.fifth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" disabled={locked || sending} onClick={() => void save()}>
        {locked ? '確定済み（変更は主将へ）' : saved ? '保存' : '登録する'}
      </button>
      <p className="form-message" role="status">
        {message}
      </p>
    </>
  );
}
