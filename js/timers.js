/* ==========================================================================
   Timer engine + audio.
   All timers in the app are TIMESTAMP-BASED (Date.now() deltas). The ticker
   only repaints — it never accumulates time — so stopwatch and rest timer stay
   exact even if iOS freezes JS while the screen is locked or the app is
   backgrounded. When the page becomes visible again we repaint immediately.
   ========================================================================== */

const subscribers = new Set();
let intervalId = null;

function runAll() {
  const now = Date.now();
  subscribers.forEach((fn) => {
    try { fn(now); } catch (e) { console.error('[ticker]', e); }
  });
}

export const ticker = {
  add(fn) {
    subscribers.add(fn);
    if (!intervalId) intervalId = setInterval(runAll, 250);
    return () => subscribers.delete(fn);
  },
  now: runAll,
};

document.addEventListener('visibilitychange', () => { if (!document.hidden) runAll(); });
window.addEventListener('pageshow', runAll);
window.addEventListener('focus', runAll);

/* ---------- Web Audio beep ----------
   iOS requires the AudioContext to be created/resumed inside a user gesture.
   We call unlockAudio() on first tap and whenever a set is checked off. */
let ctx = null;

export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // A 1-sample silent buffer fully unlocks audio on older iOS versions.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* audio unsupported */ }
}

function playTones() {
  const now = ctx.currentTime;
  [[0, 880], [0.22, 880], [0.44, 1320]].forEach(([t, freq]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.28, now + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.2);
  });
}

export function beep() {
  if (!ctx) return;
  try {
    if (ctx.state !== 'running') ctx.resume().then(playTones).catch(() => {});
    else playTones();
  } catch { /* noop */ }
}

/** Subtle end-of-rest alert: 3-tone beep + vibration where supported. */
export function restDoneAlert() {
  beep();
  try { navigator.vibrate?.([180, 90, 180, 90, 260]); } catch { /* noop */ }
}
