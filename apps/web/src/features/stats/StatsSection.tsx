import {
  presetPeriod,
  previousPeriod,
  validatePeriod,
  type StatsPeriod,
  type Validated,
} from '@kyudo/core';
import { useState } from 'react';
import { ChoiceRow } from '../../components/ChoiceRow.tsx';
import { HitStatsView } from './hits/HitStatsView.tsx';
import { PenaltyStatsView } from './penalty/PenaltyStatsView.tsx';
import { PeriodPicker, type PeriodChoice } from './PeriodPicker.tsx';

const ITEMS = { penalty: '罰', hit: '的中' };

/** 期間を指定して統計を見る。項目が増えたら、ここで切り替える */
export function StatsSection({ today }: { today: string }) {
  const [item, setItem] = useState<keyof typeof ITEMS>('penalty');
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
      <ChoiceRow label="集計する内容" options={ITEMS} value={item} onChange={setItem} />
      <PeriodPicker today={today} choice={choice} onChange={setChoice} />
      {!period.ok && (
        <p className="form-error" role="alert">
          {period.message}
        </p>
      )}
      {period.ok && item === 'penalty' && (
        <PenaltyStatsView
          period={period.value}
          previous={previousPeriod(choice.preset, period.value)}
          today={today}
        />
      )}
      {period.ok && item === 'hit' && (
        <HitStatsView
          period={period.value}
          previous={previousPeriod(choice.preset, period.value)}
        />
      )}
    </div>
  );
}
