// 張り出し用の順位の紙。順位の付いた人だけを載せる
import { fiscalYearOf, shortDate } from './date.ts';
import {
  HIT_FILTER_LABELS,
  minimumShots,
  rankHits,
  totalsByMember,
  type HitDay,
  type HitFilter,
  type HitMetric,
  type HitPeriod,
  type RankedHits,
} from './hit-stats.ts';
import type { Gender } from './member.ts';

export const CLUB_NAME = '島根大学弓道部';

/** `split` は男女を別の欄にする。`all` は男女をまとめる */
export const POSTER_TARGETS = ['split', 'all', 'male', 'female'] as const;
export type PosterTarget = (typeof POSTER_TARGETS)[number];

export const POSTER_TARGET_LABELS: Record<PosterTarget, string> = {
  split: '男女別',
  all: '男女まとめ',
  male: '男子',
  female: '女子',
};

export const POSTER_METRIC_TITLES: Record<HitMetric, string> = {
  rate: '的中率順',
  shots: '射数順',
  hits: '的中数順',
};

/** 1つの順位を左右2列に分けるのは、この人数を超えるとき */
const SINGLE_COLUMN_MAX = 30;

export type PosterRow = Pick<RankedHits, 'rank' | 'shots' | 'hits'> & { name: string };

export type PosterColumn = { heading: string | null; rows: PosterRow[] };

/** 名前の長さ。全角を1、半角を約半分と数える。紙の文字の大きさを決めるのに使う */
export function nameWidth(name: string): number {
  return [...name].reduce((width, char) => width + (char.codePointAt(0)! > 0xff ? 1 : 0.55), 0);
}

export type Poster = {
  /** 載る人の中で、いちばん長い名前の長さ */
  longestName: number;
  title: string;
  subtitle: string;
  metric: HitMetric;
  /** 左から順の欄。1つか2つ */
  columns: PosterColumn[];
  note: string;
};

function periodTitle({ id, label, period }: HitPeriod): string {
  const { from, to } = period;
  if (id === 'fiscal_year') return `${fiscalYearOf(from)}年度`;
  if (from.slice(0, 7) !== to.slice(0, 7)) return label;
  return `${from.slice(0, 4)}年${Number(from.slice(5, 7))}月`;
}

function describeFilter(filter: HitFilter): string {
  if (filter === 'all') return '3区分の合計';
  return filter === 'practice' ? '練習（射込み・自練）' : HIT_FILTER_LABELS[filter];
}

function noteOf(metric: HitMetric, filter: HitFilter): string {
  if (metric === 'rate') {
    return `的中率は、的中数の合計を射数の合計で割った値。${minimumShots(filter, metric)}射以上の人を掲載。同じ的中率は同じ順位。`;
  }
  return `${metric === 'shots' ? '射数' : '的中数'}の多い順。同じ数は同じ順位。`;
}

export function buildPoster(input: {
  days: readonly HitDay[];
  members: readonly { id: string; name: string; gender: Gender }[];
  period: HitPeriod;
  metric: HitMetric;
  target: PosterTarget;
  filter: HitFilter;
}): Poster {
  const { days, members, period, metric, target, filter } = input;
  const byId = new Map(members.map((member) => [member.id, member]));
  const inside = days.filter(
    (day) => day.date >= period.period.from && day.date <= period.period.to,
  );
  const totals = totalsByMember(inside, filter).filter((total) => byId.has(total.memberId));
  const nameOf = (memberId: string) => byId.get(memberId)!.name;

  const rankOf = (gender: Gender | null): PosterRow[] => {
    const chosen = totals
      .filter((total) => gender === null || byId.get(total.memberId)!.gender === gender)
      // 順位も射数も同じ人は、名前の順
      .sort((a, b) => nameOf(a.memberId).localeCompare(nameOf(b.memberId), 'ja'));
    return rankHits(chosen, filter, metric).ranked.map(({ memberId, rank, shots, hits }) => ({
      rank,
      name: nameOf(memberId),
      shots,
      hits,
    }));
  };

  let columns: PosterColumn[];
  if (target === 'split') {
    columns = [
      { heading: '男子', rows: rankOf('male') },
      { heading: '女子', rows: rankOf('female') },
    ];
  } else {
    const rows = rankOf(target === 'all' ? null : target);
    const heading = target === 'all' ? null : POSTER_TARGET_LABELS[target];
    const half = Math.ceil(rows.length / 2);
    columns =
      rows.length > SINGLE_COLUMN_MAX
        ? [
            { heading, rows: rows.slice(0, half) },
            { heading, rows: rows.slice(half) },
          ]
        : [{ heading, rows }];
  }

  const { from, to } = period.period;
  const names = columns.flatMap((column) => column.rows.map((row) => nameWidth(row.name)));
  return {
    longestName: Math.max(0, ...names),
    title: `${periodTitle(period)}\u3000${POSTER_METRIC_TITLES[metric]}`,
    subtitle: [CLUB_NAME, `${shortDate(from)}〜${shortDate(to)}`, describeFilter(filter)].join(
      '　',
    ),
    metric,
    columns,
    note: noteOf(metric, filter),
  };
}
