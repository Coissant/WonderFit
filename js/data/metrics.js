/* The ONLY four nutrition metrics tracked by the app. */
import { round } from '../utils.js';

export const METRICS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: 'var(--c-cal)', overIsBad: true },
  { key: 'protein', label: 'Protein', unit: 'g', color: 'var(--c-pro)', overIsBad: false },
  { key: 'sugar', label: 'Sugar', unit: 'g', color: 'var(--c-sug)', overIsBad: true },
  { key: 'sodium', label: 'Sodium', unit: 'mg', color: 'var(--c-sod)', overIsBad: true },
];

export function fmtMetric(m, n, withUnit = true) {
  const v = Number(n) || 0;
  const shown = (m.key === 'protein' || m.key === 'sugar') && v < 10 ? round(v, 1) : Math.round(v);
  if (!withUnit) return shown.toLocaleString();
  return m.unit === 'kcal' ? `${shown.toLocaleString()} kcal` : `${shown.toLocaleString()}${m.unit}`;
}

export function metricStatus(m, value, goal) {
  const v = Number(value) || 0;
  const g = Number(goal) || 0;
  const pct = g > 0 ? v / g : 0;
  const over = g > 0 && v > g;
  let color = m.color;
  if (over && m.overIsBad) color = m.key === 'calories' ? 'var(--warning)' : 'var(--danger)';
  let text = '';
  if (g > 0) {
    if (v >= g && !m.overIsBad) text = 'Goal hit ✓';
    else if (over) text = `${fmtMetric(m, v - g)} over`;
    else text = `${fmtMetric(m, g - v)} left`;
  }
  return { pct, over, color, text };
}
