import { axisScale } from './scale.ts';

export type ChartSeries = {
  id: string;
  label: string;
  /** 色と線の種類の番号（`stats.css` の `.tone-N`） */
  tone: number;
  values: readonly number[];
};

/** `axis` は軸の下に出す文字。2行まで */
export type ChartPoint = { id: string; axis: readonly string[] };

const WIDTH = 343;
const HEIGHT = 230;
/** 右は、端の日付が切れないように空ける */
const PLOT = { right: 328, top: 20, bottom: 190 };
const MIN_LEFT = 28;
/** 縦軸の数1文字の幅と、軸との間 */
const DIGIT_WIDTH = 7;
const TICK_GAP = 8;
const LINE_HEIGHT = 14;
const MAX_AXIS_LABELS = 8;
/** 棒の上に数を出すのは、区切りがこの数まで */
const MAX_LABELED_POINTS = 8;
const MAX_BAR_WIDTH = 22;
const BAR_GAP = 2;

/** 時間の流れに沿った縦棒か折れ線。数は、そばに置く表でも読めるようにする。 */
export function TimeSeriesChart({
  title,
  kind,
  unit,
  points,
  series,
  max = 0,
  goal,
}: {
  /** 読み上げ用のグラフの題 */
  title: string;
  kind: 'bar' | 'line';
  unit: string;
  points: readonly ChartPoint[];
  series: readonly ChartSeries[];
  /** 縦軸に少なくとも含める数 */
  max?: number;
  /** 点線で示す目標の数 */
  goal?: number | undefined;
}) {
  const { top, ticks } = axisScale(
    Math.max(max, goal ?? 0, ...series.flatMap((item) => item.values)),
  );
  // 1つだけの系列は、題で分かるので凡例を出さず、線にも数を添える
  const single = series.length === 1;
  // 大きい数でも欠けないように、桁の数だけ左を空ける
  const left = Math.max(MIN_LEFT, String(top).length * DIGIT_WIDTH + TICK_GAP);
  const slot = (PLOT.right - left) / points.length;
  const center = (index: number) => left + slot * (index + 0.5);
  const y = (value: number) => PLOT.bottom - (value / top) * (PLOT.bottom - PLOT.top);
  const barWidth = Math.min(
    MAX_BAR_WIDTH,
    (slot * 0.84 - BAR_GAP * (series.length - 1)) / series.length,
  );
  const groupWidth = barWidth * series.length + BAR_GAP * (series.length - 1);
  const labelEvery = Math.ceil(points.length / MAX_AXIS_LABELS);

  return (
    <figure className="chart">
      {!single && (
        <ul className="chart-legend">
          {series.map((item) => (
            <li key={item.id} className={`tone-${item.tone}`}>
              <span className={kind === 'line' ? 'key key-line' : 'key'} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
        <text className="chart-text" x="0" y="9">
          （{unit}）
        </text>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick ? 'chart-grid' : 'chart-axis'}
              x1={left}
              x2={PLOT.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-text" x={left - 6} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {goal !== undefined && (
          <line className="chart-goal" x1={left} x2={PLOT.right} y1={y(goal)} y2={y(goal)} />
        )}
        {series.map((item, order) => (
          <g key={item.id} className={`tone-${item.tone}`}>
            {kind === 'bar' ? (
              item.values.map((value, index) => {
                const x = center(index) - groupWidth / 2 + order * (barWidth + BAR_GAP);
                return (
                  <g key={points[index]!.id}>
                    <rect
                      className="chart-bar"
                      x={x}
                      y={y(value)}
                      width={barWidth}
                      height={PLOT.bottom - y(value)}
                    />
                    {points.length <= MAX_LABELED_POINTS && (
                      <text
                        className="chart-value"
                        x={x + barWidth / 2}
                        y={y(value) - 4}
                        textAnchor="middle"
                      >
                        {value}
                      </text>
                    )}
                  </g>
                );
              })
            ) : (
              <>
                <polyline
                  className="chart-line"
                  points={item.values.map((value, i) => `${center(i)},${y(value)}`).join(' ')}
                />
                {item.values.map((value, index) => (
                  <g key={points[index]!.id}>
                    <circle className="chart-dot" cx={center(index)} cy={y(value)} r="3.5" />
                    {single && points.length <= MAX_LABELED_POINTS && (
                      <text
                        className="chart-value"
                        x={center(index)}
                        y={y(value) - 8}
                        textAnchor="middle"
                      >
                        {value}
                      </text>
                    )}
                  </g>
                ))}
              </>
            )}
          </g>
        ))}
        {points.map(
          (point, index) =>
            index % labelEvery === 0 &&
            point.axis.map((text, line) => (
              <text
                key={`${point.id}-${text}`}
                className="chart-text"
                x={center(index)}
                y={PLOT.bottom + 16 + line * LINE_HEIGHT}
                textAnchor="middle"
              >
                {text}
              </text>
            )),
        )}
      </svg>
    </figure>
  );
}
