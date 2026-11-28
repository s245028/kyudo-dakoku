// 的中の順位と集計。的中率は、的中数の合計を射数の合計で割る（日ごとの率は平均しない）
import { addDays, daysBetween, shortDate, type PracticeDate } from './date.ts';
import { HIT_CATEGORIES, sumTallies, type HitCategory, type HitTally } from './hit.ts';
import {
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  presetPeriod,
  rankDescending,
  splitPeriod,
  type BucketUnit,
  type StatsPeriod,
} from './stats.ts';

/** 見る区分。`practice` は射込みと自練の合計 */
export const HIT_FILTERS = ['all', 'practice', 'standing', 'drill', 'self'] as const;
export type HitFilter = (typeof HIT_FILTERS)[number];

export const HIT_FILTER_LABELS: Record<HitFilter, string> = {
  all: 'すべて',
  practice: '練習',
  standing: '立ち',
  drill: '射込み',
  self: '自練',
};

export function categoriesOf(filter: HitFilter): readonly HitCategory[] {
  if (filter === 'all') return HIT_CATEGORIES;
  return filter === 'practice' ? ['drill', 'self'] : [filter];
}

/** 1人の1日の記録。引いていない区分は0 */
export type HitDay = {
  memberId: string;
  date: PracticeDate;
  tallies: Record<HitCategory, HitTally>;
};

export function tallyOf(day: HitDay, filter: HitFilter): HitTally {
  return sumTallies(categoriesOf(filter).map((category) => day.tallies[category]));
}

export const totalOf = (days: readonly HitDay[], filter: HitFilter): HitTally =>
  sumTallies(days.map((day) => tallyOf(day, filter)));

export type MemberHits = HitTally & {
  memberId: string;
  /** その区分を引いた日の数 */
  days: number;
};

/** 部員ごとの合計。見る区分を1射も引いていない人は含めない。 */
export function totalsByMember(days: readonly HitDay[], filter: HitFilter): MemberHits[] {
  const totals = new Map<string, MemberHits>();
  for (const day of days) {
    const tally = tallyOf(day, filter);
    if (tally.shots === 0) continue;
    const total = totals.get(day.memberId);
    totals.set(day.memberId, {
      memberId: day.memberId,
      days: (total?.days ?? 0) + 1,
      shots: (total?.shots ?? 0) + tally.shots,
      hits: (total?.hits ?? 0) + tally.hits,
    });
  }
  return [...totals.values()];
}

export const HIT_METRICS = ['rate', 'shots', 'hits'] as const;
export type HitMetric = (typeof HIT_METRICS)[number];

export const HIT_METRIC_LABELS: Record<HitMetric, string> = {
  rate: '的中率',
  shots: '射数',
  hits: '的中数',
};

export const metricValue = (tally: HitTally, metric: HitMetric): number =>
  metric === 'rate' ? (tally.shots === 0 ? 0 : tally.hits / tally.shots) : tally[metric];

const RANKED_SHOTS_ALL = 40;
const RANKED_SHOTS_FILTERED = 12;

/** 順位が付くのに必要な射数。条件があるのは的中率の順位だけ。 */
export function minimumShots(filter: HitFilter, metric: HitMetric): number {
  if (metric !== 'rate') return 1;
  return filter === 'all' ? RANKED_SHOTS_ALL : RANKED_SHOTS_FILTERED;
}

export type RankedHits = MemberHits & { rank: number };

/**
 * 順位。同じ値は同じ順位（1, 2, 2, 4）で、その中は射数の多い順、同じなら渡した順。
 * 射数が条件に足りない人は、順位を付けず射数の多い順に分けて返す。
 */
export function rankHits(
  totals: readonly MemberHits[],
  filter: HitFilter,
  metric: HitMetric = 'rate',
): { ranked: RankedHits[]; unranked: MemberHits[] } {
  const minimum = minimumShots(filter, metric);
  const byShots = [...totals].sort((a, b) => b.shots - a.shots);
  return {
    ranked: rankDescending(
      byShots.filter((total) => total.shots >= minimum),
      (total) => metricValue(total, metric),
    ),
    unranked: byShots.filter((total) => total.shots < minimum),
  };
}

export type HitPeriod = { id: string; label: string; period: StatsPeriod };

const monthStart = (date: PracticeDate): PracticeDate => `${date.slice(0, 7)}-01`;
const previousMonthEnd = (date: PracticeDate) => addDays(monthStart(date), -1);

/** 順位で選べる期間。今月・先月・今年度と、それより前の、記録を始めた月までの各月 */
export function hitRankingPeriods(startDate: PracticeDate, today: PracticeDate): HitPeriod[] {
  const periods: HitPeriod[] = PERIOD_PRESETS.map((preset) => ({
    id: preset,
    label: PERIOD_PRESET_LABELS[preset],
    period: presetPeriod(preset, today),
  }));
  // 先月より前の月を、新しい順に
  for (
    let end = previousMonthEnd(previousMonthEnd(today));
    end >= startDate;
    end = previousMonthEnd(end)
  ) {
    periods.push({
      id: end.slice(0, 7),
      label: `${end.slice(0, 4)}年${Number(end.slice(5, 7))}月`,
      period: { from: monthStart(end), to: end },
    });
  }
  return periods;
}

/** 引いた日ごとに点を打つのは、この日数まで。超えたら週か月にまとめる */
const DAILY_SERIES_MAX_DAYS = 62;

export type HitPoint = HitTally & {
  id: string;
  /** グラフの軸に出す短い表示 */
  label: string;
  /** 表に出す表示 */
  description: string;
};

/** 推移。短い期間は引いた日ごと、長い期間は週か月ごとで、引いていない区切りは除く。 */
export function hitSeries(
  days: readonly HitDay[],
  period: StatsPeriod,
  filter: HitFilter,
): { unit: BucketUnit; points: HitPoint[] } {
  const inside = days.filter((day) => day.date >= period.from && day.date <= period.to);
  if (daysBetween(period.from, period.to) < DAILY_SERIES_MAX_DAYS) {
    const dates = [...new Set(inside.map((day) => day.date))].sort();
    const points = dates.map((date) => ({
      id: date,
      label: shortDate(date),
      description: shortDate(date),
      ...totalOf(
        inside.filter((day) => day.date === date),
        filter,
      ),
    }));
    return { unit: 'day', points: points.filter((point) => point.shots > 0) };
  }
  return clubHitSeries(inside, period, filter);
}

/** 部全体の推移。期間の長さに合わせて日・週・月に区切り、記録のない区切りは除く */
export function clubHitSeries(
  days: readonly HitDay[],
  period: StatsPeriod,
  filter: HitFilter,
): { unit: BucketUnit; points: HitPoint[] } {
  const { unit, buckets } = splitPeriod(period);
  const points = buckets.map(({ from, to, label, description }) => ({
    id: from,
    label,
    description,
    ...totalOf(
      days.filter((day) => day.date >= from && day.date <= to),
      filter,
    ),
  }));
  return { unit, points: points.filter((point) => point.shots > 0) };
}

export type HitOverview = HitTally & {
  /** 記録した部員の数 */
  recorders: number;
};

/** 期間の部全体の数。記録がなければ null（比べられない） */
export function hitOverview(
  days: readonly HitDay[],
  period: StatsPeriod,
  filter: HitFilter,
): HitOverview | null {
  const totals = totalsByMember(
    days.filter((day) => day.date >= period.from && day.date <= period.to),
    filter,
  );
  if (totals.length === 0) return null;
  return { ...sumTallies(totals), recorders: totals.length };
}
