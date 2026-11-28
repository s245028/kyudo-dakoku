import { axisScale } from '../charts/scale.ts';

export type MemberBar = { id: string; name: string; value: number };

const SLOT = 28;
const BAR = 16;
const HEIGHT = 280;
const PLOT = { top: 20, bottom: 180 };
const AXIS_WIDTH = 36;

/** 部員を横に並べた縦棒。人数が多いときは、横になぞって見る */
export function MemberBars({
  title,
  bars,
  max = 0,
}: {
  /** 読み上げ用のグラフの題 */
  title: string;
  bars: readonly MemberBar[];
  /** 縦軸に少なくとも含める数 */
  max?: number;
}) {
  const { top, ticks } = axisScale(Math.max(max, ...bars.map((bar) => bar.value)));
  const y = (value: number) => PLOT.bottom - (value / top) * (PLOT.bottom - PLOT.top);
  const width = bars.length * SLOT;

  return (
    <figure className="member-bars">
      <svg width={AXIS_WIDTH} height={HEIGHT} aria-hidden="true">
        {ticks.map((tick) => (
          <text
            key={tick}
            className="chart-text"
            x={AXIS_WIDTH - 5}
            y={y(tick) + 4}
            textAnchor="end"
          >
            {tick}
          </text>
        ))}
      </svg>
      <div className="member-bars-scroll">
        <svg width={width} height={HEIGHT} role="img" aria-label={title}>
          {ticks.map((tick) => (
            <line
              key={tick}
              className={tick ? 'chart-grid' : 'chart-axis'}
              x1="0"
              x2={width}
              y1={y(tick)}
              y2={y(tick)}
            />
          ))}
          {bars.map((bar, index) => {
            const center = index * SLOT + SLOT / 2;
            return (
              <g key={bar.id} className="tone-1">
                <rect
                  className="chart-bar"
                  x={center - BAR / 2}
                  y={y(bar.value)}
                  width={BAR}
                  height={PLOT.bottom - y(bar.value)}
                />
                <text className="chart-value" x={center} y={y(bar.value) - 4} textAnchor="middle">
                  {bar.value}
                </text>
                <text className="member-name" x={center} y={PLOT.bottom + 8}>
                  {bar.name.replace(/\s+/g, '')}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
