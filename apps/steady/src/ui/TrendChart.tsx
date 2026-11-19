import { useId } from 'react';
import type { HistoryPoint } from '../logic/trend';
import type { Side } from '../tests';
import styles from './ui.module.css';

interface Props {
  points: readonly HistoryPoint[];
  /** Test name, used in the title. */
  name: string;
  unit: string;
  side?: Side;
}

const W = 600;
const H = 260;
const PAD = { left: 56, right: 24, top: 20, bottom: 44 };
const R = 6;

/** Left is a circle, right is a square and no side is a diamond, so the chart reads in greyscale (R11.4). */
function Marker({ side, x, y, day, value }: { side: Side | undefined; x: number; y: number; day: string; value: number }) {
  const common = { fill: 'currentColor', 'data-point': '', 'data-day': day, 'data-value': value };
  if (side === 'right') return <rect x={x - R} y={y - R} width={R * 2} height={R * 2} {...common} />;
  if (side === 'left') return <circle cx={x} cy={y} r={R} {...common} />;
  return <polygon points={`${x},${y - R - 1} ${x + R + 1},${y} ${x},${y + R + 1} ${x - R - 1},${y}`} {...common} />;
}

/** Inline SVG trend with a table of the same points (R10.6). No chart library. */
export function TrendChart({ points, name, unit, side }: Props) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const sideName = side ? `${side} side` : null;
  const first = points[0];
  const last = points[points.length - 1];
  const desc = first && last
    ? `${points.length} ${points.length === 1 ? 'day' : 'days'} with results, from ${first.day} to ${last.day}. First value ${first.value} ${unit}, latest ${last.value} ${unit}. The same values are in the table below.`
    : 'No results.';

  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        className={styles.chartSvg}
        fill="none"
      >
        <title id={titleId}>{`${name}${sideName ? `, ${sideName}` : ''}: best result per day (${unit})`}</title>
        <desc id={descId}>{desc}</desc>
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="currentColor" strokeWidth="1.5" />
        <line x1={PAD.left} y1={PAD.top + plotH} x2={W - PAD.right} y2={PAD.top + plotH} stroke="currentColor" strokeWidth="1.5" />
        <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" fontSize="14" fill="currentColor">
          {max}
        </text>
        <text x={PAD.left - 8} y={PAD.top + plotH + 4} textAnchor="end" fontSize="14" fill="currentColor">
          0
        </text>
        <text x={14} y={PAD.top + plotH / 2} fontSize="14" fill="currentColor" transform={`rotate(-90 14 ${PAD.top + plotH / 2})`} textAnchor="middle">
          {unit}
        </text>
        {first && (
          <text x={x(0)} y={H - 14} textAnchor={points.length === 1 ? 'middle' : 'start'} fontSize="14" fill="currentColor">
            {first.day}
          </text>
        )}
        {last && points.length > 1 && (
          <text x={x(points.length - 1)} y={H - 14} textAnchor="end" fontSize="14" fill="currentColor">
            {last.day}
          </text>
        )}
        {points.length > 1 && (
          <polyline
            points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
            stroke="currentColor"
            strokeWidth="2"
          />
        )}
        {points.map((p, i) => (
          <Marker key={p.day} side={side} x={x(i)} y={y(p.value)} day={p.day} value={p.value} />
        ))}
      </svg>
      <table className={styles.chartTable}>
        <caption className="visually-hidden">{`${name}${sideName ? `, ${sideName}` : ''}: best result per day`}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{`Best result (${unit})`}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
