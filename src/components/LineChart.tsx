interface Point {
  label: string;
  // 0 to 100.
  value: number;
}

interface Props {
  title: string;
  summary: string;
  points: Point[];
}

const WIDTH = 640;
const HEIGHT = 220;
const LEFT = 40;
const BOTTOM = 26;
const TOP = 10;
const RIGHT = 12;
const PERCENT_MAX = 100;

// A score trend: one marker per submitted attempt, joined in time order.
export function LineChart({ title, summary, points }: Props) {
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (index: number) => LEFT + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => TOP + plotHeight - (value / PERCENT_MAX) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title}. ${summary}`} className="chart-svg">
        <line x1={LEFT} y1={y(0)} x2={WIDTH - RIGHT} y2={y(0)} className="chart-axis" />
        <line x1={LEFT} y1={y(PERCENT_MAX)} x2={WIDTH - RIGHT} y2={y(PERCENT_MAX)} className="chart-axis chart-axis-faint" />
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={y(0)} className="chart-axis" />
        <text x={LEFT - 6} y={y(0)} className="chart-label chart-label-end">0%</text>
        <text x={LEFT - 6} y={y(PERCENT_MAX) + 8} className="chart-label chart-label-end">100%</text>
        {points.length > 1 && <path d={path} className="chart-line" fill="none" />}
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={x(index)} cy={y(point.value)} r={5} className="chart-point">
              <title>{`${point.label}: ${point.value}%`}</title>
            </circle>
            <text x={x(index)} y={y(point.value) - 9} className="chart-label chart-label-middle">
              {point.value}%
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
