import type { EditableSettings } from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import type { RunAction } from '../../lib/useAction.ts';

const NUMBER_FIELDS = [
  ['noticeLeadMinutes', '連絡の締め切り（集合の何分前）'],
  ['penaltyDoublingDays', '罰が倍になる日数'],
  ['leaderPenaltyMultiplier', '上4役の罰の倍率（主将・男女の副将・主務。1なら部員と同じ）'],
] as const;

/** ふだん変えない、打刻の細かい決まり */
const DETAIL_FIELDS = [
  ['duplicateScanSeconds', '二重読み取りを無視する秒数'],
  ['undoSeconds', '打刻を取り消せる秒数'],
  ['allowedDistanceMeters', '道場からの許容距離（m）'],
] as const;

const COORDINATE_FIELDS = [
  ['dojoLatitude', '道場の緯度（空なら位置チェックをしない）'],
  ['dojoLongitude', '道場の経度'],
] as const;

export function SettingsForm({
  settings,
  sending,
  run,
}: {
  settings: EditableSettings;
  sending: boolean;
  run: RunAction;
}) {
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = input.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    // 数値でない入力はそのまま送り、サーバーの確認で理由を返してもらう
    const number = (key: string) => (read(key) === '' ? null : Number(read(key)));
    setMessage('');
    const ok = await run('admin-update-settings', {
      settings: {
        ...Object.fromEntries(
          [...NUMBER_FIELDS, ...DETAIL_FIELDS, ...COORDINATE_FIELDS].map(([key]) => [
            key,
            number(key),
          ]),
        ),
        autoCheckoutTime: read('autoCheckoutTime'),
        hitStartDate: read('hitStartDate') || null,
        komaLocked: input.get('komaLocked') === 'on',
      },
    });
    if (ok) setMessage('保存しました');
  }

  return (
    <form className="form" onSubmit={(event) => void save(event)}>
      <label className="check">
        <input type="checkbox" name="komaLocked" defaultChecked={settings.komaLocked} />
        コマ表を確定する（部員は変更できない）
      </label>
      {NUMBER_FIELDS.map(([key, label]) => (
        <label key={key}>
          {label}
          <input type="number" name={key} defaultValue={settings[key]} min={0} required />
        </label>
      ))}
      <label>
        自動退室の時刻
        <input
          type="time"
          name="autoCheckoutTime"
          defaultValue={settings.autoCheckoutTime}
          required
        />
      </label>
      <label>
        的中の記録を始める日（空なら記録できない）
        <input type="date" name="hitStartDate" defaultValue={settings.hitStartDate ?? ''} />
      </label>
      <details className="disclosure">
        <summary>詳しい設定（打刻と位置の確認）</summary>
        <div className="disclosure-body">
          {DETAIL_FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <input type="number" name={key} defaultValue={settings[key]} min={0} required />
            </label>
          ))}
          {COORDINATE_FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <input name={key} inputMode="decimal" defaultValue={settings[key] ?? ''} />
            </label>
          ))}
        </div>
      </details>
      <button type="submit" disabled={sending}>
        設定を保存
      </button>
      <p className="form-message" role="status">
        {message}
      </p>
    </form>
  );
}
