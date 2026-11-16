import { useId } from 'react';

export interface BarSeries {
  name: string;
  values: number[];
  // The first series is solid and the second striped, so they differ by more than colour.
  style: 'solid' | 'striped';
}

interface Props {
  title: string;
  // Said to screen readers in place of the picture.
  summary: string;
  labels: string[];
  series: BarSeries[];
}

const WIDTH = 640;
const HEIGHT = 220;
const LEFT = 40;
const BOTTOM = 26;
const TOP = 10;
const BAR_GAP = 0.2;

export function BarChart({ title, summary, labels, series }: Props) {
  const uid = useId();
  const patternId = `${uid}-stripes`;
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const plotWidth = WIDTH - LEFT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const group = plotWidth / labels.length;
  const bar = (group * (1 - BAR_GAP)) / series.length;
  const y = (value: number) => TOP + plotHeight - (value / max) * plotHeight;
  const shown = new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1]);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title}. ${summary}`} className="chart-svg">
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="chart-stripe-bg" />
            <line x1="0" y1="0" x2="0" y2="6" className="chart-stripe-line" />
          </pattern>
        </defs>
        <line x1={LEFT} y1={y(0)} x2={WIDTH} y2={y(0)} className="chart-axis" />
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={y(0)} className="chart-axis" />
        <text x={LEFT - 6} y={y(0)} className="chart-label chart-label-end">0</text>
        <text x={LEFT - 6} y={TOP + 8} className="chart-label chart-label-end">{max}</text>
        {labels.map((label, index) => (
          <g key={label}>
            {series.map((item, seriesIndex) => {
              const value = item.values[index] ?? 0;
              return (
                <rect
                  key={item.name}
                  x={LEFT + index * group + (group * BAR_GAP) / 2 + seriesIndex * bar}
                  y={y(value)}
                  width={Math.max(bar - 1, 1)}
                  height={y(0) - y(value)}
                  className={item.style === 'solid' ? 'chart-bar' : 'chart-bar chart-bar-striped'}
                  fill={item.style === 'striped' ? `url(#${patternId})` : undefined}
                >
                  <title>{`${label}: ${item.name} ${value}`}</title>
                </rect>
              );
            })}
            {shown.has(index) && (
              <text x={LEFT + index * group + group / 2} y={HEIGHT - 8} className="chart-label chart-label-middle">
                {label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption>
        <ul className="chart-legend" aria-label="Legend">
          {series.map((item) => (
            <li key={item.name}>
              <span className={`chart-key chart-key-${item.style}`} aria-hidden="true" /> {item.name} ({item.style === 'solid' ? 'solid bars' : 'striped bars'})
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
