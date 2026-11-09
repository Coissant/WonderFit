/* ==========================================================================
   Shared utilities: DOM helpers, event bus, dates, numbers & weight units.
   ========================================================================== */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const uid = () =>
  (globalThis.crypto && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const clone = (o) => JSON.parse(JSON.stringify(o));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/* ---------- Event bus (decouples modules) ---------- */
const bus = new EventTarget();
export function on(evt, fn) {
  const h = (e) => fn(e.detail);
  bus.addEventListener(evt, h);
  return () => bus.removeEventListener(evt, h);
}
export function emit(evt, detail) {
  bus.dispatchEvent(new CustomEvent(evt, { detail }));
}

/* ---------- Dates (always LOCAL time, keyed as YYYY-MM-DD) ---------- */
export const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
/** Monday-based start of week */
export function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
/** Whole days from a → b (DST-safe) */
export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function friendlyDate(key) {
  const now = new Date();
  if (key === dateKey(now)) return 'Today';
  if (key === dateKey(addDays(now, -1))) return 'Yesterday';
  if (key === dateKey(addDays(now, 1))) return 'Tomorrow';
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function longDate(key) {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
/** 0:00 / 12:34 / 1:02:03 */
export function fmtDuration(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtDurationWords(ms) {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/* ---------- Numbers ---------- */
export const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
export const round = (n, dp = 0) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};
export const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString();

/* ---------- Weight units ---------- */
export const LB_PER_KG = 2.20462262;
export function convertWeight(w, from, to) {
  const v = Number(w) || 0;
  if (!v || !from || !to || from === to) return v;
  return from === 'kg' ? v * LB_PER_KG : v / LB_PER_KG;
}
export const fmtWeight = (w, unit) => `${round(w, 1)} ${unit}`;

/** "185 lbs × 8" (converted to toUnit) — bodyweight sets render as "8 reps" */
export function fmtSet(set, toUnit) {
  const w = convertWeight(num(set.weight), set.unit || toUnit, toUnit);
  return w > 0 ? `${fmtWeight(w, toUnit)} × ${set.reps}` : `${set.reps} reps`;
}
/** Compact "185 × 8" for narrow table columns */
export function fmtSetShort(set, toUnit) {
  const w = convertWeight(num(set.weight), set.unit || toUnit, toUnit);
  return w > 0 ? `${round(w, 1)} × ${set.reps}` : `BW × ${set.reps}`;
}
export function workoutVolume(w, toUnit) {
  return (w.exercises || []).reduce((t, e) =>
    t + e.sets.reduce((s, x) => s + convertWeight(num(x.weight), x.unit || toUnit, toUnit) * num(x.reps), 0), 0);
}
export const setCount = (w) => (w.exercises || []).reduce((t, e) => t + e.sets.length, 0);

/** Heaviest set (ties → most reps) */
export function topSet(sets = []) {
  return sets.reduce((best, s) => {
    if (!best) return s;
    const a = num(s.weight), b = num(best.weight);
    return a > b || (a === b && num(s.reps) > num(best.reps)) ? s : best;
  }, null);
}

/* ---------- Misc ---------- */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

const scriptCache = new Map();
export function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptCache.delete(src); s.remove(); reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}
