import {
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  presetPeriod,
  shortDate,
  type PeriodPreset,
  type StatsPeriod,
} from '@kyudo/core';

/** `from` と `to` は、日付を指定するときの入力欄の値 */
export type PeriodChoice = StatsPeriod & { preset: PeriodPreset | 'custom' };

export function PeriodPicker({
  today,
  choice,
  onChange,
}: {
  today: string;
  choice: PeriodChoice;
  onChange: (choice: PeriodChoice) => void;
}) {
  // 日付の指定に切り替えたら、直前に見ていた期間から直せるようにする
  const select = (preset: PeriodChoice['preset']) =>
    onChange({
      ...choice,
      ...(choice.preset !== 'custom' && presetPeriod(choice.preset, today)),
      preset,
    });

  return (
    <div className="period-picker">
      <label className="period-select">
        期間
        <select
          value={choice.preset}
          onChange={(event) => select(event.target.value as PeriodChoice['preset'])}
        >
          {PERIOD_PRESETS.map((preset) => {
            const { from, to } = presetPeriod(preset, today);
            return (
              <option key={preset} value={preset}>
                {PERIOD_PRESET_LABELS[preset]}（{shortDate(from)}〜{shortDate(to)}）
              </option>
            );
          })}
          <option value="custom">期間を指定</option>
        </select>
      </label>
      {choice.preset === 'custom' && (
        <div className="period-inputs">
          {(['from', 'to'] as const).map((key) => (
            <label key={key}>
              {key === 'from' ? '開始日' : '終了日'}
              <input
                type="date"
                value={choice[key]}
                onChange={(event) => onChange({ ...choice, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
