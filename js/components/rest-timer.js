/* ==========================================================================
   Automated Floating Rest Timer Component
   - Timestamp delta calculation (Date.now()) for background-safe precision
   - Configurable countdown, +15s / -15s dynamic adjustment
   - Audio beep + haptic vibration when finished
   - Accessible from any tab
   ========================================================================== */

import { $, fmtDuration } from '../utils.js';
import { icon } from '../icons.js';
import { ticker, restDoneAlert, unlockAudio } from '../timers.js';

class RestTimerComponent {
  el = null;
  unsubscribeTicker = null;
  targetTimestamp = 0;   // Date.now() + remainingMs
  totalDurationMs = 0;   // for progress calculation
  isPaused = false;
  remainingWhenPaused = 0;
  hasAlerted = false;

  init() {
    this.el = $('#rest-timer');
    if (!this.el) return;
    this.render();
    this.bindEvents();
    this.unsubscribeTicker = ticker.add((now) => this.tick(now));
  }

  render() {
    this.el.innerHTML = `
      <div class="rest-timer-pill">
        <div class="rt-progress-bg">
          <div class="rt-progress-bar" id="rt-bar"></div>
        </div>
        <div class="rt-left">
          <span class="rt-icon">${icon('timer', 18)}</span>
          <span class="rt-time" id="rt-time">0:00</span>
          <span class="rt-label" id="rt-label">Rest</span>
        </div>
        <div class="rt-controls">
          <button class="rt-btn" id="rt-minus" title="-15s" aria-label="Subtract 15 seconds">-15s</button>
          <button class="rt-btn" id="rt-plus" title="+15s" aria-label="Add 15 seconds">+15s</button>
          <button class="rt-btn rt-pause" id="rt-pause" title="Pause/Resume" aria-label="Pause or Resume">${icon('play', 14)}</button>
          <button class="rt-btn rt-close" id="rt-close" title="Dismiss" aria-label="Dismiss">${icon('x', 14)}</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.el.addEventListener('click', (e) => {
      unlockAudio();
      const target = e.target.closest('button');
      if (!target) return;

      if (target.id === 'rt-minus') {
        this.adjust(-15);
      } else if (target.id === 'rt-plus') {
        this.adjust(15);
      } else if (target.id === 'rt-pause') {
        this.togglePause();
      } else if (target.id === 'rt-close') {
        this.stop();
      }
    });
  }

  start(seconds = 90) {
    unlockAudio();
    const durationMs = Math.max(5, seconds) * 1000;
    this.totalDurationMs = durationMs;
    this.targetTimestamp = Date.now() + durationMs;
    this.isPaused = false;
    this.hasAlerted = false;

    this.el.classList.remove('hidden', 'finished');
    this.updatePauseButton();
    this.tick(Date.now());
  }

  adjust(deltaSec) {
    if (this.targetTimestamp <= 0) return;
    const deltaMs = deltaSec * 1000;
    if (this.isPaused) {
      this.remainingWhenPaused = Math.max(0, this.remainingWhenPaused + deltaMs);
    } else {
      this.targetTimestamp = Math.max(Date.now(), this.targetTimestamp + deltaMs);
    }
    this.totalDurationMs = Math.max(this.totalDurationMs + deltaMs, 1000);
    this.hasAlerted = false;
    this.el.classList.remove('finished');
    this.tick(Date.now());
  }

  togglePause() {
    if (this.targetTimestamp <= 0) return;
    if (this.isPaused) {
      // Resume
      this.isPaused = false;
      this.targetTimestamp = Date.now() + this.remainingWhenPaused;
    } else {
      // Pause
      this.isPaused = true;
      this.remainingWhenPaused = Math.max(0, this.targetTimestamp - Date.now());
    }
    this.updatePauseButton();
  }

  updatePauseButton() {
    const pauseBtn = $('#rt-pause', this.el);
    if (!pauseBtn) return;
    pauseBtn.innerHTML = this.isPaused ? icon('play', 14) : '<span style="font-size:12px;font-weight:700">ll</span>';
    const label = $('#rt-label', this.el);
    if (label) label.textContent = this.isPaused ? 'Paused' : 'Rest';
  }

  tick(now) {
    if (!this.targetTimestamp || this.el.classList.contains('hidden')) return;

    let remainingMs = 0;
    if (this.isPaused) {
      remainingMs = this.remainingWhenPaused;
    } else {
      remainingMs = Math.max(0, this.targetTimestamp - now);
    }

    const timeEl = $('#rt-time', this.el);
    const barEl = $('#rt-bar', this.el);
    const labelEl = $('#rt-label', this.el);

    if (timeEl) timeEl.textContent = fmtDuration(remainingMs);

    if (barEl && this.totalDurationMs > 0) {
      const pct = Math.min(100, Math.max(0, (remainingMs / this.totalDurationMs) * 100));
      barEl.style.width = `${pct}%`;
    }

    if (remainingMs <= 0 && !this.hasAlerted) {
      this.hasAlerted = true;
      this.el.classList.add('finished');
      if (labelEl) labelEl.textContent = 'Time Up!';
      restDoneAlert();
      // Auto-hide after 3 seconds of showing "Time Up!"
      setTimeout(() => {
        if (this.hasAlerted && this.targetTimestamp && Date.now() >= this.targetTimestamp) {
          this.stop();
        }
      }, 3500);
    }
  }

  stop() {
    this.targetTimestamp = 0;
    this.isPaused = false;
    this.hasAlerted = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('finished');
  }

  isActive() {
    return this.targetTimestamp > 0 && !this.el.classList.contains('hidden');
  }
}

export const restTimer = new RestTimerComponent();
