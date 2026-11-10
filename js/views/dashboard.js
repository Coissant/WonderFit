/* ==========================================================================
   Module 3: Workout Calendar & Monthly Split Builder
   - Interactive Monthly Calendar Grid (Mon–Sun)
   - Color-coded status: Completed Workout, Scheduled Split Day, Rest Day
   - Split Designer: Weekly or Custom Rotation cycle editor with templates
   - Day inspection: view completed stats or click "Start This Workout"
     to immediately load routine into Live Workout Tracker
   - Edit each split day's AUTO-FILL exercises from the calendar or designer
   ========================================================================== */

import { $, $$, esc, uid, clone, dateKey, longDate, fmtDuration, WEEKDAYS } from '../utils.js';
import { openSheet, actionSheet, confirmDialog, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { repo, planForDate } from '../store/repository.js';
import { SPLIT_TEMPLATES, splitFromTemplate } from '../data/split-templates.js';
import { getDailyQuote } from '../data/quotes.js';
import { openDayExerciseEditor } from '../components/day-exercise-editor.js';
import { workoutView } from './workout.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayLabel = (split, idx) => (split.type === 'weekly' ? (WEEKDAYS[idx] || `Day ${idx + 1}`) : `Day ${idx + 1}`);

class DashboardView {
  container = null;
  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth(); // 0-11
  selectedDate = dateKey();
  activeSplit = null;
  workouts = [];
  overrides = [];
  exercises = [];
  settings = null;
  quoteOffset = 0;

  async init(container) {
    this.container = container;
    // Single delegated listener — survives every re-render.
    this.container.addEventListener('click', (e) => this.onClick(e));
    await this.refresh();
  }

  async refresh() {
    [this.settings, this.activeSplit, this.workouts, this.overrides, this.exercises] = await Promise.all([
      repo.getSettings(), repo.getActiveSplit(), repo.getWorkouts(), repo.getAllOverrides(), repo.getExercises(),
    ]);
    this.render();
  }

  exName(id) {
    return this.exercises.find((e) => e.id === id)?.name || null;
  }

  renderQuoteHtml() {
    const q = getDailyQuote(this.quoteOffset);
    return `
      <div class="card quote-card" id="dashboard-quote-box">
        <div class="quote-header">
          <span class="quote-tag">${icon('flame', 13)} Daily Motivation</span>
          <button class="quote-cycle-btn" data-act="next-quote" title="Show another quote" aria-label="Show another quote">
            ${icon('repeat', 13)}
          </button>
        </div>
        <p class="quote-body">${esc(q.text)}</p>
        <span class="quote-author">${esc(q.author)}</span>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     RENDER
     ------------------------------------------------------------------------ */
  render() {
    const monthPrefix = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}`;
    const monthWorkouts = this.workouts.filter((w) => w.date && w.date.startsWith(monthPrefix));
    const totalMonthVolume = Math.round(monthWorkouts.reduce((t, w) => t + (w.totalVolume || 0), 0));
    const unit = this.settings.weightUnit || 'lbs';
    const split = this.activeSplit;
    const trainingDays = split ? split.days.filter((d) => !d.rest).length : 0;

    this.container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Dashboard & Calendar</h1>
        <button class="btn btn-secondary btn-sm" data-act="open-designer">
          ${icon('layers', 16)} Split Designer
        </button>
      </div>

      <div class="view-content">
        <div class="card split-banner-card">
          <div class="split-banner-left">
            <span class="badge badge-accent">Active Split</span>
            <h3 class="split-banner-title">${esc(split?.name || 'No split yet')}</h3>
            <span class="split-banner-meta">${split
              ? `${split.type === 'weekly' ? '7-Day Weekly' : `${split.days.length}-Day Rotation`} · ${trainingDays} training day${trainingDays === 1 ? '' : 's'}`
              : 'Create a split to schedule your month'}</span>
          </div>
          <button class="btn btn-secondary btn-sm" data-act="open-designer">${icon('edit', 14)} Edit</button>
        </div>

        ${this.renderQuoteHtml()}

        <div class="calendar-nav-bar">
          <button class="icon-btn" data-act="prev-month" aria-label="Previous month">${icon('chevronLeft', 20)}</button>
          <h2 class="calendar-month-title" data-act="this-month" role="button" tabindex="0" title="Tap to jump to current month">${MONTHS[this.currentMonth]} ${this.currentYear}</h2>
          <button class="icon-btn" data-act="next-month" aria-label="Next month">${icon('chevronRight', 20)}</button>
        </div>

        <div class="month-stats-row">
          <div class="month-stat-chip"><span class="chip-num">${monthWorkouts.length}</span><span class="chip-label">Workouts</span></div>
          <div class="month-stat-chip"><span class="chip-num">${totalMonthVolume.toLocaleString()}</span><span class="chip-label">${unit} Volume</span></div>
        </div>

        <div class="calendar-card card">
          <div class="calendar-weekdays-row">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="calendar-days-grid">${this.renderCalendarGridHtml()}</div>
          <div class="cal-legend">
            <span><i class="legend-dot completed"></i>Completed</span>
            <span><i class="legend-dot scheduled"></i>Scheduled</span>
            <span><i class="legend-dot rest"></i>Rest</span>
          </div>
        </div>

        <div class="day-detail-wrap" id="day-detail-wrap">
          ${this.renderDayDetailHtml(this.selectedDate)}
        </div>
      </div>
    `;
  }

  renderCalendarGridHtml() {
    const first = new Date(this.currentYear, this.currentMonth, 1);
    const totalDays = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const startWeekday = (first.getDay() + 6) % 7;
    const todayStr = dateKey();
    let cells = '';

    for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell cal-cell-empty"></div>';

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const done = this.getCompletedWorkoutForDate(dateStr);
      const plan = this.getPlan(dateStr);
      let statusClass = 'status-rest';
      let tag = 'Rest';
      let fullTitle = `${d} — Rest Day`;

      if (done) {
        statusClass = 'status-completed';
        tag = 'Done ✓';
        fullTitle = `${d} — Completed: ${done.title || 'Workout'}`;
      } else if (plan && !plan.day.rest) {
        statusClass = 'status-scheduled';
        tag = plan.day.name.replace(/\s+(Day|Workout)$/i, '');
        if (tag.length > 7) tag = tag.slice(0, 6) + '…';
        fullTitle = `${d} — Scheduled: ${plan.day.name}`;
      }

      cells += `
        <button type="button" class="cal-cell ${statusClass} ${dateStr === todayStr ? 'today' : ''} ${dateStr === this.selectedDate ? 'selected' : ''}" data-date="${dateStr}" title="${esc(fullTitle)}" aria-label="${esc(fullTitle)}">
          <span class="cal-day-num">${d}</span>
          <span class="cal-tag">${esc(tag)}</span>
        </button>`;
    }
    return cells;
  }

  renderDayDetailHtml(dateStr) {
    const completed = this.getCompletedWorkoutForDate(dateStr);
    const plan = this.getPlan(dateStr);
    const unit = this.settings?.weightUnit || 'lbs';

    if (completed) {
      const totalSets = (completed.exercises || []).reduce((t, e) => t + (e.sets || []).filter((s) => s.completed).length, 0);
      return `
        <div class="card day-card day-card-completed">
          <div class="day-card-header">
            <div class="day-card-heading">
              <span class="badge badge-success">Completed Workout</span>
              <h3 class="day-card-title">${esc(completed.title || 'Workout')}</h3>
              <span class="day-card-date">${longDate(dateStr)}</span>
            </div>
            <div class="day-card-stat">
              <span class="day-stat-big">${Math.round(completed.totalVolume || 0).toLocaleString()}</span>
              <span class="day-stat-unit">${unit} volume</span>
            </div>
          </div>
          <div class="day-detail-summary-row">
            <span>Duration <strong>${fmtDuration(completed.durationMs || 0)}</strong></span>
            <span>Sets <strong>${totalSets}</strong></span>
            <span>Exercises <strong>${completed.exercises?.length || 0}</strong></span>
          </div>
          <div class="day-exercises-preview">
            ${(completed.exercises || []).map((e) => `
              <div class="day-exercise-item">
                <span class="day-ex-name">${esc(e.name)}</span>
                <span class="day-ex-sets">${(e.sets || []).filter((s) => s.completed).length} sets</span>
              </div>`).join('')}
          </div>
          <div class="day-actions-stack">
            <button class="btn btn-secondary btn-block" data-act="repeat-day">${icon('repeat', 18)} Repeat This Workout</button>
          </div>
        </div>`;
    }

    if (plan && !plan.day.rest) {
      const names = (plan.day.exerciseIds || []).map((id) => this.exName(id)).filter(Boolean);
      return `
        <div class="card day-card day-card-scheduled">
          <div class="day-card-header">
            <div class="day-card-heading">
              <span class="badge badge-accent">Scheduled${plan.override ? ' · Swapped' : ''}</span>
              <h3 class="day-card-title">${esc(plan.day.name)}</h3>
              <span class="day-card-date">${longDate(dateStr)}</span>
            </div>
            <div class="day-card-stat">
              <span class="day-stat-big">${names.length}</span>
              <span class="day-stat-unit">exercises</span>
            </div>
          </div>

          <div class="autofill-head">
            <span class="autofill-label">Auto-fill exercises</span>
            <button class="btn-text-accent btn-sm" data-act="edit-day-ex">${icon('edit', 14)} Edit</button>
          </div>
          ${names.length
            ? `<ol class="plan-ex-list">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>`
            : '<div class="empty-state-text">No exercises assigned yet — tap Edit to add some.</div>'}

          <div class="day-actions-stack">
            <button class="btn btn-primary btn-large btn-block" data-act="start-planned">${icon('play', 20)} Start This Workout</button>
            <button class="btn btn-secondary btn-block" data-act="override-day">${icon('repeat', 16)} Swap Routine for This Day</button>
          </div>
        </div>`;
    }

    return `
      <div class="card day-card day-card-rest">
        <div class="day-card-header">
          <div class="day-card-heading">
            <span class="badge badge-subtle">Rest & Recovery</span>
            <h3 class="day-card-title">Rest Day</h3>
            <span class="day-card-date">${longDate(dateStr)}</span>
          </div>
          <span class="rest-icon-large">${icon('moon', 32)}</span>
        </div>
        <p class="day-card-desc">${this.activeSplit
          ? 'Recovery is when the growth happens. Want to train anyway?'
          : 'No split is active yet. Open the Split Designer to schedule your month.'}</p>
        <div class="day-actions-stack">
          ${this.activeSplit
            ? `<button class="btn btn-secondary btn-block" data-act="override-day">${icon('dumbbell', 16)} Schedule a Workout on This Day</button>`
            : `<button class="btn btn-primary btn-block" data-act="open-designer">${icon('layers', 16)} Open Split Designer</button>`}
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------------
     EVENTS (delegated)
     ------------------------------------------------------------------------ */
  async onClick(e) {
    const cell = e.target.closest('.cal-cell[data-date]');
    if (cell) {
      haptic(15);
      this.selectedDate = cell.dataset.date;
      $$('.cal-cell', this.container).forEach((c) => c.classList.toggle('selected', c === cell));
      $('#day-detail-wrap', this.container).innerHTML = this.renderDayDetailHtml(this.selectedDate);
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    switch (btn.dataset.act) {
      case 'next-quote': {
        this.quoteOffset = (this.quoteOffset || 0) + 1;
        const box = $('#dashboard-quote-box', this.container);
        if (box) {
          box.outerHTML = this.renderQuoteHtml();
        } else {
          this.render();
        }
        haptic(15);
        break;
      }
      case 'open-designer':
        this.openSplitDesigner();
        break;
      case 'prev-month':
        this.currentMonth = (this.currentMonth + 11) % 12;
        if (this.currentMonth === 11) this.currentYear--;
        this.render();
        break;
      case 'next-month':
        this.currentMonth = (this.currentMonth + 1) % 12;
        if (this.currentMonth === 0) this.currentYear++;
        this.render();
        break;
      case 'this-month': {
        const now = new Date();
        this.currentYear = now.getFullYear();
        this.currentMonth = now.getMonth();
        this.selectedDate = dateKey(now);
        this.render();
        break;
      }
      case 'start-planned': {
        const plan = this.getPlan(this.selectedDate);
        if (plan && !plan.day.rest) {
          document.querySelector('.tab[data-tab="workout"]')?.click();
          await workoutView.startWorkoutFromSplitDay(plan.day, plan.split);
        }
        break;
      }
      case 'repeat-day': {
        const w = this.getCompletedWorkoutForDate(this.selectedDate);
        if (w) {
          document.querySelector('.tab[data-tab="workout"]')?.click();
          await workoutView.startWorkoutFromPrevious(w);
        }
        break;
      }
      case 'edit-day-ex': {
        const plan = this.getPlan(this.selectedDate);
        if (plan) this.editSavedDayExercises(plan.split, plan.day);
        break;
      }
      case 'override-day':
        this.openDayOverrideSheet(this.selectedDate);
        break;
      default:
        break;
    }
  }

  /** Edit a saved split day's auto-fill list and persist immediately. */
  editSavedDayExercises(split, day) {
    openDayExerciseEditor({
      title: `${day.name} Exercises`,
      dayName: day.name,
      exerciseIds: day.exerciseIds,
      onSave: async (ids) => {
        await repo.updateSplitDayExercises(split.id, day.id, ids);
        toast(`${day.name} will auto-fill ${ids.length} exercise${ids.length === 1 ? '' : 's'}`, { type: 'success' });
        await this.refresh();
      },
    });
  }

  getCompletedWorkoutForDate(dateStr) {
    return this.workouts.find((w) => w.date === dateStr);
  }

  getPlan(dateStr) {
    return planForDate(this.activeSplit, this.overrides, dateStr);
  }

  /* ------------------------------------------------------------------------
     SPLIT DESIGNER
     ------------------------------------------------------------------------ */
  async openSplitDesigner() {
    const savedSplits = await repo.getSplits();
    let draft = this.activeSplit ? clone(this.activeSplit) : splitFromTemplate(SPLIT_TEMPLATES[0]);
    let isNew = !this.activeSplit;

    const html = () => {
      const days = draft.days.map((day, idx) => {
        const names = (day.exerciseIds || []).map((id) => this.exName(id)).filter(Boolean);
        return `
          <div class="split-day-row card ${day.rest ? 'is-rest' : ''}" data-idx="${idx}">
            <div class="split-day-row-header">
              <span class="split-day-idx-badge">${dayLabel(draft, idx)}</span>
              <input type="text" class="text-input split-day-name-input" data-field="day-name" value="${esc(day.name)}" placeholder="${day.rest ? 'Rest' : 'e.g. Legs'}" ${day.rest ? 'disabled' : ''}>
              <label class="toggle-switch-label">
                <input type="checkbox" data-field="day-rest" ${day.rest ? 'checked' : ''}>
                <span>Rest</span>
              </label>
            </div>
            ${day.rest ? '' : `
              <div class="split-day-exercises-box">
                <div class="split-day-chips">
                  ${names.length ? names.map((n) => `<span class="ex-chip">${esc(n)}</span>`).join('') : '<span class="text-subtle">No exercises assigned</span>'}
                </div>
              </div>`}
            <div class="split-day-actions">
              ${day.rest ? '' : `<button class="btn btn-secondary btn-sm" data-act="day-ex">${icon('edit', 14)} Exercises (${names.length})</button>`}
              ${draft.type === 'rotation' ? `
                <span class="spacer"></span>
                <button class="icon-btn sm" data-act="day-up" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">${icon('chevronUp', 16)}</button>
                <button class="icon-btn sm" data-act="day-down" ${idx === draft.days.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('chevronDown', 16)}</button>
                <button class="icon-btn sm danger" data-act="day-del" aria-label="Delete day">${icon('trash', 16)}</button>` : ''}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="split-designer-wrap">
          ${savedSplits.length > 1 ? `
            <div class="form-group">
              <label>Your Saved Splits</label>
              <select class="text-input select-input" data-field="load-split">
                ${savedSplits.map((s) => `<option value="${s.id}" ${s.id === draft.id ? 'selected' : ''}>${esc(s.name)}${s.isActive ? ' (active)' : ''}</option>`).join('')}
                ${isNew ? '<option value="" selected>New split (unsaved)</option>' : ''}
              </select>
            </div>` : ''}

          <div class="form-group">
            <label>Split Name</label>
            <input type="text" class="text-input" data-field="name" value="${esc(draft.name)}">
          </div>

          <div class="form-group">
            <label>Split Structure</label>
            <div class="tab-toggle-group">
              <button class="toggle-btn ${draft.type === 'weekly' ? 'active' : ''}" data-act="type" data-type="weekly">7-Day Weekly</button>
              <button class="toggle-btn ${draft.type === 'rotation' ? 'active' : ''}" data-act="type" data-type="rotation">Custom Rotation</button>
            </div>
            <p class="field-hint">${draft.type === 'weekly'
              ? 'Same routine on the same weekday, every week.'
              : 'Days cycle in order (e.g. Push → Pull → Legs → Rest) regardless of weekday.'}</p>
          </div>

          ${draft.type === 'rotation' ? `
            <div class="form-group">
              <label>Day 1 of the cycle falls on</label>
              <input type="date" class="text-input" data-field="start" value="${esc(draft.startDate || dateKey())}">
            </div>` : ''}

          <div class="section-header">
            <h4 class="section-title">Quick Presets</h4>
          </div>
          <div class="templates-grid">
            ${SPLIT_TEMPLATES.map((t) => `
              <button class="template-choice-btn" data-act="template" data-key="${t.key}">
                <strong>${esc(t.name)}</strong>
                <span class="text-subtle">${esc(t.description)}</span>
              </button>`).join('')}
          </div>

          <div class="section-header">
            <h4 class="section-title">Split Days (${draft.days.length})</h4>
            ${draft.type === 'rotation' ? `<button class="btn btn-secondary btn-sm" data-act="add-day">${icon('plus', 14)} Add Day</button>` : ''}
          </div>
          <div class="split-days-container">${days}</div>

          ${!isNew && savedSplits.length > 1 ? `<button class="btn btn-danger-outline btn-block mt-2" data-act="delete-split">${icon('trash', 16)} Delete This Split</button>` : ''}
        </div>`;
    };

    const sheet = openSheet({
      title: 'Split Designer',
      full: true,
      html: html(),
      footer: `<button class="btn btn-primary btn-large btn-block" data-act="save">${icon('check', 18)} Save & Apply to Calendar</button>`,
    });

    const rerender = () => {
      const scroll = sheet.body.scrollTop;
      sheet.body.innerHTML = html();
      sheet.body.scrollTop = scroll;
    };

    sheet.body.addEventListener('input', (e) => {
      const f = e.target.dataset.field;
      if (f === 'name') draft.name = e.target.value;
      else if (f === 'day-name') {
        const idx = Number(e.target.closest('[data-idx]').dataset.idx);
        draft.days[idx].name = e.target.value;
      }
    });

    sheet.body.addEventListener('change', async (e) => {
      const f = e.target.dataset.field;
      if (f === 'start') draft.startDate = e.target.value || dateKey();
      else if (f === 'day-rest') {
        const day = draft.days[Number(e.target.closest('[data-idx]').dataset.idx)];
        day.rest = e.target.checked;
        if (day.rest) day.name = 'Rest';
        else if (day.name.toLowerCase() === 'rest') day.name = 'Workout';
        rerender();
      } else if (f === 'load-split' && e.target.value) {
        const found = savedSplits.find((s) => s.id === e.target.value);
        if (found) { draft = clone(found); isNew = false; rerender(); }
      }
    });

    sheet.body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const rowEl = btn.closest('[data-idx]');
      const idx = rowEl ? Number(rowEl.dataset.idx) : -1;

      switch (btn.dataset.act) {
        case 'type': {
          const type = btn.dataset.type;
          if (type === draft.type) return;
          if (type === 'weekly' && draft.days.length !== 7) {
            const base = draft.days;
            draft.days = Array.from({ length: 7 }, (_, i) => base[i] || { id: uid(), name: 'Rest', rest: true, exerciseIds: [] });
          }
          if (type === 'rotation' && !draft.startDate) draft.startDate = dateKey();
          draft.type = type;
          rerender();
          break;
        }
        case 'template': {
          const t = SPLIT_TEMPLATES.find((x) => x.key === btn.dataset.key);
          if (!t) return;
          draft = splitFromTemplate(t);
          isNew = true;
          rerender();
          toast(`Loaded "${t.name}" — tap Save to apply`);
          break;
        }
        case 'add-day':
          draft.days.push({ id: uid(), name: `Day ${draft.days.length + 1}`, rest: false, exerciseIds: [] });
          rerender();
          sheet.body.scrollTop = sheet.body.scrollHeight;
          break;
        case 'day-up':
          if (idx > 0) [draft.days[idx - 1], draft.days[idx]] = [draft.days[idx], draft.days[idx - 1]];
          rerender();
          break;
        case 'day-down':
          if (idx < draft.days.length - 1) [draft.days[idx + 1], draft.days[idx]] = [draft.days[idx], draft.days[idx + 1]];
          rerender();
          break;
        case 'day-del':
          if (draft.days.length <= 1) { toast('A rotation needs at least one day', { type: 'warn' }); return; }
          draft.days.splice(idx, 1);
          rerender();
          break;
        case 'day-ex': {
          const day = draft.days[idx];
          openDayExerciseEditor({
            title: `${day.name || dayLabel(draft, idx)} Exercises`,
            dayName: day.name || dayLabel(draft, idx),
            exerciseIds: day.exerciseIds,
            saveLabel: 'Done',
            onSave: async (ids) => {
              day.exerciseIds = ids;
              this.exercises = await repo.getExercises(); // pick up any new custom exercises
              rerender();
            },
          });
          break;
        }
        case 'delete-split': {
          const ok = await confirmDialog(`Delete "${draft.name}"? Your workout history is not affected.`, { title: 'Delete Split', okText: 'Delete', danger: true });
          if (!ok) return;
          await repo.deleteSplit(draft.id);
          const remaining = (await repo.getSplits())[0];
          if (remaining) await repo.setActiveSplit(remaining.id);
          toast('Split deleted');
          sheet.close();
          await this.refresh();
          break;
        }
        default:
          break;
      }
    });

    sheet.footer.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-act="save"]')) return;
      draft.name = draft.name.trim() || 'My Split';
      draft.days.forEach((d, i) => { if (!d.rest && !d.name.trim()) d.name = dayLabel(draft, i); });
      draft.isActive = true;
      await repo.saveSplit(draft);
      await repo.setActiveSplit(draft.id);
      toast('Split saved & projected across your calendar!', { type: 'success' });
      sheet.close();
      await this.refresh();
    });
  }

  openDayOverrideSheet(dateStr) {
    const split = this.activeSplit;
    if (!split) return;
    const actions = split.days.map((d, i) => ({
      label: `${dayLabel(split, i)}: ${d.name}${d.rest ? '' : ` (${d.exerciseIds?.length || 0} exercises)`}`,
      icon: d.rest ? 'moon' : 'dumbbell',
      onClick: async () => {
        await repo.setOverride(dateStr, d.id);
        toast(`${longDate(dateStr)} → ${d.name}`);
        await this.refresh();
      },
    }));
    actions.push({
      label: 'Reset to Default Schedule',
      icon: 'repeat',
      danger: true,
      onClick: async () => {
        await repo.removeOverride(dateStr);
        toast('Restored default schedule');
        await this.refresh();
      },
    });
    actionSheet({ title: `Plan for ${longDate(dateStr)}`, actions });
  }
}

export const dashboardView = new DashboardView();
