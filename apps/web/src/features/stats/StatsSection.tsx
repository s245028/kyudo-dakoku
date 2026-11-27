import {
  presetPeriod,
  previousPeriod,
  validatePeriod,
  type StatsPeriod,
  type Validated,
} from '@kyudo/core';
import { useState } from 'react';
import { PenaltyStatsView } from './penalty/PenaltyStatsView.tsx';
import { PeriodPicker, type PeriodChoice } from './PeriodPicker.tsx';

/** 期間を指定して統計を見る。項目が増えたら、ここで切り替える */
export function StatsSection({ today }: { today: string }) {
  const [choice, setChoice] = useState<PeriodChoice>(() => ({
    preset: 'this_month',
    ...presetPeriod('this_month', today),
  }));
  const period: Validated<StatsPeriod> =
    choice.preset === 'custom'
      ? validatePeriod(choice.from, choice.to)
      : { ok: true, value: presetPeriod(choice.preset, today) };

  return (
    <div className="stats">
      <PeriodPicker today={today} choice={choice} onChange={setChoice} />
      {period.ok ? (
        <PenaltyStatsView
          period={period.value}
          previous={previousPeriod(choice.preset, period.value)}
          today={today}
        />
      ) : (
        <p className="form-error" role="alert">
          {period.message}
        </p>
      )}
    </div>
  );
}
