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
const PLOT = { left: 28, right: 341, top: 20, bottom: 190 };
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
}: {
  /** 読み上げ用のグラフの題 */
  title: string;
  kind: 'bar' | 'line';
  unit: string;
  points: readonly ChartPoint[];
  series: readonly ChartSeries[];
}) {
  const { top, ticks } = axisScale(Math.max(0, ...series.flatMap((item) => item.values)));
  const slot = (PLOT.right - PLOT.left) / points.length;
  const center = (index: number) => PLOT.left + slot * (index + 0.5);
  const y = (value: number) => PLOT.bottom - (value / top) * (PLOT.bottom - PLOT.top);
  const barWidth = Math.min(
    MAX_BAR_WIDTH,
    (slot * 0.84 - BAR_GAP * (series.length - 1)) / series.length,
  );
  const groupWidth = barWidth * series.length + BAR_GAP * (series.length - 1);
  const labelEvery = Math.ceil(points.length / MAX_AXIS_LABELS);

  return (
    <figure className="chart">
      <ul className="chart-legend">
        {series.map((item) => (
          <li key={item.id} className={`tone-${item.tone}`}>
            <span className={kind === 'line' ? 'key key-line' : 'key'} />
            {item.label}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
        <text className="chart-text" x="0" y="9">
          （{unit}）
        </text>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick ? 'chart-grid' : 'chart-axis'}
              x1={PLOT.left}
              x2={PLOT.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-text" x={PLOT.left - 6} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
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
                  <circle
                    key={points[index]!.id}
                    className="chart-dot"
                    cx={center(index)}
                    cy={y(value)}
                    r="3.5"
                  />
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
