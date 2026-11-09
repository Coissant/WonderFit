/* ==========================================================================
   Module 3: Workout Calendar & Monthly Split Builder
   - Interactive Monthly Calendar Grid (Mon–Sun)
   - Color-coded status: Completed Workout, Scheduled Split Day, Rest Day
   - Split Designer: Weekly or Custom Rotation cycle editor with templates
   - Day inspection: view completed stats or click "Start This Workout"
     to immediately load routine into Live Workout Tracker
   ========================================================================== */

import { $, $$, num, round, esc, uid, dateKey, parseDateKey, addDays, longDate, daysBetween, fmtDuration } from '../utils.js';
import { openSheet, actionSheet, confirmDialog, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { repo } from '../store/repository.js';
import { SPLIT_TEMPLATES, splitFromTemplate } from '../data/split-templates.js';
import { workoutView } from './workout.js';

class DashboardView {
  container = null;
  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth(); // 0-11
  selectedDate = dateKey();
  activeSplit = null;
  workouts = [];
  overrides = [];
  settings = null;

  async init(container) {
    this.container = container;
    await this.refresh();
  }

  async refresh() {
    this.settings = await repo.getSettings();
    this.activeSplit = await repo.getActiveSplit();
    this.workouts = await repo.getWorkouts();
    this.overrides = await repo.getAllOverrides();
    this.render();
  }

  render() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthLabel = `${monthNames[this.currentMonth]} ${this.currentYear}`;

    // Compute month stats
    const monthPrefix = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}`;
    const monthWorkouts = this.workouts.filter((w) => w.date && w.date.startsWith(monthPrefix));
    const totalMonthVolume = Math.round(monthWorkouts.reduce((t, w) => t + (w.totalVolume || 0), 0));
    const unit = this.settings.weightUnit || 'lbs';

    this.container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Dashboard & Calendar</h1>
        <button class="btn btn-secondary btn-sm" id="btn-open-split-designer">
          ${icon('layers', 16)} Split Designer
        </button>
      </div>

      <div class="view-content">
        <!-- TOP SPLIT INFO BANNER -->
        <div class="card split-banner-card">
          <div class="split-banner-left">
            <span class="badge badge-accent">Active Split</span>
            <h3 class="split-banner-title">${esc(this.activeSplit?.name || 'Push / Pull / Legs / Rest')}</h3>
            <span class="split-banner-meta">${this.activeSplit?.type === 'weekly' ? 'Weekly (7-Day)' : `${this.activeSplit?.days?.length || 4}-Day Rotation`}</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-edit-split-quick">Edit</button>
        </div>

        <!-- MONTH NAVIGATION -->
        <div class="calendar-nav-bar">
          <button class="icon-btn" id="btn-cal-prev" aria-label="Previous month">${icon('chevronLeft', 20)}</button>
          <span class="calendar-month-title">${monthLabel}</span>
          <button class="icon-btn" id="btn-cal-next" aria-label="Next month">${icon('chevronRight', 20)}</button>
        </div>

        <!-- MONTH STATS CHIPS -->
        <div class="month-stats-row">
          <div class="month-stat-chip">
            <span class="chip-num">${monthWorkouts.length}</span>
            <span class="chip-label">Workouts</span>
          </div>
          <div class="month-stat-chip">
            <span class="chip-num">${totalMonthVolume.toLocaleString()}</span>
            <span class="chip-label">${unit} Volume</span>
          </div>
        </div>

        <!-- INTERACTIVE MONTHLY CALENDAR GRID -->
        <div class="calendar-card card">
          <div class="calendar-weekdays-row">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
          <div class="calendar-days-grid" id="calendar-days-grid">
            ${this.renderCalendarGridHtml()}
          </div>
        </div>

        <!-- DAY DETAIL CARD (Tapping any day updates this) -->
        <div class="day-detail-wrap" id="day-detail-wrap">
          ${this.renderDayDetailHtml(this.selectedDate)}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    $('#btn-cal-prev', this.container)?.addEventListener('click', () => {
      if (this.currentMonth === 0) {
        this.currentMonth = 11;
        this.currentYear--;
      } else {
        this.currentMonth--;
      }
      this.render();
    });

    $('#btn-cal-next', this.container)?.addEventListener('click', () => {
      if (this.currentMonth === 11) {
        this.currentMonth = 0;
        this.currentYear++;
      } else {
        this.currentMonth++;
      }
      this.render();
    });

    $('#btn-open-split-designer', this.container)?.addEventListener('click', () => {
      this.openSplitDesigner();
    });

    $('#btn-edit-split-quick', this.container)?.addEventListener('click', () => {
      this.openSplitDesigner();
    });

    // Calendar day clicks
    $$('.cal-cell[data-date]', this.container).forEach((cell) => {
      cell.addEventListener('click', () => {
        haptic(20);
        this.selectedDate = cell.dataset.date;
        $$('.cal-cell', this.container).forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');

        const detailWrap = $('#day-detail-wrap', this.container);
        if (detailWrap) {
          detailWrap.innerHTML = this.renderDayDetailHtml(this.selectedDate);
          this.bindDayDetailEvents();
        }
      });
    });

    this.bindDayDetailEvents();
  }

  bindDayDetailEvents() {
    const detailWrap = $('#day-detail-wrap', this.container);
    if (!detailWrap) return;

    // "Start This Workout" button
    $('#btn-start-planned-workout', detailWrap)?.addEventListener('click', async () => {
      const splitDay = this.getScheduledSplitDayForDate(this.selectedDate);
      if (splitDay && !splitDay.rest) {
        // Switch to workout tab
        document.querySelector('.tab[data-tab="workout"]')?.click();
        await workoutView.startWorkoutFromSplitDay(splitDay);
      }
    });

    // "Repeat Completed Workout"
    $('#btn-repeat-day-workout', detailWrap)?.addEventListener('click', async () => {
      const workout = this.getCompletedWorkoutForDate(this.selectedDate);
      if (workout) {
        document.querySelector('.tab[data-tab="workout"]')?.click();
        await workoutView.startWorkoutFromPrevious(workout);
      }
    });

    // "Override / Change Routine for this Date"
    $('#btn-override-day', detailWrap)?.addEventListener('click', () => {
      this.openDayOverrideSheet(this.selectedDate);
    });
  }

  /* ------------------------------------------------------------------------
     CALENDAR GRID RENDERER
     ------------------------------------------------------------------------ */
  renderCalendarGridHtml() {
    const firstDayOfMonth = new Date(this.currentYear, this.currentMonth, 1);
    const lastDayOfMonth = new Date(this.currentYear, this.currentMonth + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    // Monday-based offset (0 = Mon, 6 = Sun)
    const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;

    const todayStr = dateKey();
    let cells = '';

    // Empty cells before day 1
    for (let i = 0; i < startWeekday; i++) {
      cells += `<div class="cal-cell cal-cell-empty"></div>`;
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedDate;

      const completedWorkout = this.getCompletedWorkoutForDate(dateStr);
      const scheduledDay = this.getScheduledSplitDayForDate(dateStr);

      let statusClass = 'status-rest';
      let tagText = '';

      if (completedWorkout) {
        statusClass = 'status-completed';
        tagText = 'Done ✓';
      } else if (scheduledDay && !scheduledDay.rest) {
        statusClass = 'status-scheduled';
        tagText = scheduledDay.name;
      } else {
        statusClass = 'status-rest';
        tagText = 'Rest';
      }

      cells += `
        <div class="cal-cell ${statusClass} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
          <span class="cal-day-num">${d}</span>
          <span class="cal-tag">${esc(tagText)}</span>
        </div>
      `;
    }

    return cells;
  }

  renderDayDetailHtml(dateStr) {
    const isToday = dateStr === dateKey();
    const completedWorkout = this.getCompletedWorkoutForDate(dateStr);
    const scheduledDay = this.getScheduledSplitDayForDate(dateStr);
    const unit = this.settings?.weightUnit || 'lbs';

    if (completedWorkout) {
      const exCount = completedWorkout.exercises?.length || 0;
      const totalSets = (completedWorkout.exercises || []).reduce((t, e) => t + (e.sets || []).filter((s) => s.completed).length, 0);
      const exListHtml = (completedWorkout.exercises || []).map((e) => `
        <div class="day-exercise-item">
          <span class="day-ex-name">${esc(e.name)}</span>
          <span class="day-ex-sets">${(e.sets || []).filter((s) => s.completed).length} sets</span>
        </div>
      `).join('');

      return `
        <div class="card day-card day-card-completed">
          <div class="day-card-header">
            <div>
              <span class="badge badge-success">Completed Workout</span>
              <h3 class="day-card-title">${esc(completedWorkout.title || 'Workout')}</h3>
              <span class="day-card-date">${longDate(dateStr)}</span>
            </div>
            <div class="day-card-stat">
              <span class="day-stat-big">${Math.round(completedWorkout.totalVolume || 0).toLocaleString()}</span>
              <span class="day-stat-unit">${unit} volume</span>
            </div>
          </div>

          <div class="day-detail-summary-row">
            <span>Duration: <strong>${fmtDuration(completedWorkout.durationMs || 0)}</strong></span>
            <span>Total Sets: <strong>${totalSets}</strong></span>
            <span>Exercises: <strong>${exCount}</strong></span>
          </div>

          <div class="day-exercises-preview">
            ${exListHtml}
          </div>

          <div class="day-actions-stack">
            <button class="btn btn-secondary btn-block" id="btn-repeat-day-workout">
              ${icon('repeat', 18)} Repeat This Workout
            </button>
          </div>
        </div>
      `;
    }

    if (scheduledDay && !scheduledDay.rest) {
      const exCount = scheduledDay.exerciseIds?.length || 0;

      return `
        <div class="card day-card day-card-scheduled">
          <div class="day-card-header">
            <div>
              <span class="badge badge-accent">Scheduled Split Routine</span>
              <h3 class="day-card-title">${esc(scheduledDay.name)}</h3>
              <span class="day-card-date">${longDate(dateStr)}</span>
            </div>
            <div class="day-card-stat">
              <span class="day-stat-big">${exCount}</span>
              <span class="day-stat-unit">exercises</span>
            </div>
          </div>

          <p class="day-card-desc">Scheduled according to your <strong>${esc(this.activeSplit?.name || 'Split')}</strong> schedule.</p>

          <div class="day-actions-stack">
            <button class="btn btn-primary btn-large btn-block" id="btn-start-planned-workout">
              ${icon('play', 20)} Start This Workout
            </button>
            <button class="btn btn-secondary btn-block" id="btn-override-day">
              ${icon('edit', 16)} Swap or Change Routine
            </button>
          </div>
        </div>
      `;
    }

    // Rest Day
    return `
      <div class="card day-card day-card-rest">
        <div class="day-card-header">
          <div>
            <span class="badge badge-subtle">Rest & Recovery</span>
            <h3 class="day-card-title">Rest Day</h3>
            <span class="day-card-date">${longDate(dateStr)}</span>
          </div>
          <span class="rest-icon-large">${icon('moon', 32)}</span>
        </div>
        <p class="day-card-desc">Allow muscle fibers and nervous system to recover for peak growth.</p>
        <div class="day-actions-stack">
          <button class="btn btn-secondary btn-block" id="btn-override-day">
            ${icon('dumbbell', 16)} Schedule a Workout on this Day
          </button>
        </div>
      </div>
    `;
  }

  getCompletedWorkoutForDate(dateStr) {
    return this.workouts.find((w) => w.date === dateStr);
  }

  getScheduledSplitDayForDate(dateStr) {
    // Check manual day override first
    const override = this.overrides.find((o) => o.id === dateStr || o.date === dateStr);
    if (override) return override;

    const split = this.activeSplit;
    if (!split || !split.days || split.days.length === 0) return null;

    if (split.type === 'weekly') {
      const targetDate = parseDateKey(dateStr);
      const dayOfWeek = (targetDate.getDay() + 6) % 7; // Mon=0, Sun=6
      return split.days[dayOfWeek] || null;
    } else {
      // Rotation cycle
      const targetDate = parseDateKey(dateStr);
      const startDate = split.startDate ? parseDateKey(split.startDate) : parseDateKey(dateKey());
      const diffDays = daysBetween(startDate, targetDate);
      const cycleLen = split.days.length;
      const index = ((diffDays % cycleLen) + cycleLen) % cycleLen;
      return split.days[index] || null;
    }
  }

  /* ------------------------------------------------------------------------
     SPLIT DESIGNER MODAL
     ------------------------------------------------------------------------ */
  async openSplitDesigner() {
    let currentSplit = this.activeSplit ? clone(this.activeSplit) : splitFromTemplate(SPLIT_TEMPLATES[0]);
    const allExercises = await repo.getExercises();

    const renderSplitDaysListHtml = () => {
      return currentSplit.days.map((day, idx) => `
        <div class="split-day-row card" data-day-idx="${idx}">
          <div class="split-day-row-header">
            <span class="split-day-idx-badge">${currentSplit.type === 'weekly' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx] || `Day ${idx + 1}` : `Day ${idx + 1}`}</span>
            <input type="text" class="text-input split-day-name-input" value="${esc(day.name)}" placeholder="Day Name" data-day-idx="${idx}">
            <label class="toggle-switch-label">
              <input type="checkbox" class="split-day-rest-toggle" data-day-idx="${idx}" ${day.rest ? 'checked' : ''}>
              <span>Rest</span>
            </label>
            ${currentSplit.type === 'rotation' ? `<button class="icon-btn btn-del-split-day" data-day-idx="${idx}">${icon('trash', 16)}</button>` : ''}
          </div>

          ${!day.rest ? `
            <div class="split-day-exercises-box">
              <div class="split-day-exercises-count">${day.exerciseIds?.length || 0} exercises assigned</div>
              <button class="btn btn-secondary btn-sm btn-manage-day-ex" data-day-idx="${idx}">Manage Exercises</button>
            </div>
          ` : ''}
        </div>
      `).join('');
    };

    const templatesHtml = SPLIT_TEMPLATES.map((t) => `
      <button class="template-choice-btn" data-key="${t.key}">
        <strong>${esc(t.name)}</strong>
        <span class="text-subtle">${esc(t.description)}</span>
      </button>
    `).join('');

    const html = `
      <div class="split-designer-wrap">
        <div class="form-group">
          <label>Split Name</label>
          <input type="text" id="split-designer-name" class="text-input" value="${esc(currentSplit.name)}">
        </div>

        <div class="form-group">
          <label>Split Structure</label>
          <div class="tab-toggle-group" id="split-type-toggle">
            <button class="toggle-btn ${currentSplit.type === 'weekly' ? 'active' : ''}" data-type="weekly">7-Day Weekly</button>
            <button class="toggle-btn ${currentSplit.type === 'rotation' ? 'active' : ''}" data-type="rotation">Custom Rotation Cycle</button>
          </div>
        </div>

        <div class="section-header">
          <h4 class="section-title">Quick Presets</h4>
        </div>
        <div class="templates-grid">
          ${templatesHtml}
        </div>

        <div class="section-header">
          <h4 class="section-title">Split Days (${currentSplit.days.length})</h4>
          ${currentSplit.type === 'rotation' ? `<button class="btn btn-secondary btn-sm" id="btn-add-rotation-day">+ Add Day</button>` : ''}
        </div>

        <div class="split-days-container" id="split-days-container">
          ${renderSplitDaysListHtml()}
        </div>

        <div class="form-actions-stack">
          <button class="btn btn-primary btn-large btn-block" id="btn-save-split-designer">
            ${icon('check', 18)} Apply Split to Calendar
          </button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'Split Designer',
      html,
      onMount: (sheetApi) => {
        const containerEl = $('#split-days-container', sheetApi.body);
        const nameInput = $('#split-designer-name', sheetApi.body);

        const bindDaysListEvents = () => {
          $$('.split-day-name-input', containerEl).forEach((inp) => {
            inp.addEventListener('input', () => {
              const idx = Number(inp.dataset.dayIdx);
              if (currentSplit.days[idx]) currentSplit.days[idx].name = inp.value;
            });
          });

          $$('.split-day-rest-toggle', containerEl).forEach((chk) => {
            chk.addEventListener('change', () => {
              const idx = Number(chk.dataset.dayIdx);
              if (currentSplit.days[idx]) {
                currentSplit.days[idx].rest = chk.checked;
                if (chk.checked && currentSplit.days[idx].name.toLowerCase() !== 'rest') {
                  currentSplit.days[idx].name = 'Rest';
                } else if (!chk.checked && currentSplit.days[idx].name.toLowerCase() === 'rest') {
                  currentSplit.days[idx].name = `Workout Day ${idx + 1}`;
                }
                containerEl.innerHTML = renderSplitDaysListHtml();
                bindDaysListEvents();
              }
            });
          });

          $$('.btn-del-split-day', containerEl).forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = Number(btn.dataset.dayIdx);
              currentSplit.days.splice(idx, 1);
              containerEl.innerHTML = renderSplitDaysListHtml();
              bindDaysListEvents();
            });
          });

          $$('.btn-manage-day-ex', containerEl).forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = Number(btn.dataset.dayIdx);
              this.openManageSplitDayExercises(currentSplit.days[idx], allExercises, () => {
                containerEl.innerHTML = renderSplitDaysListHtml();
                bindDaysListEvents();
              });
            });
          });
        };

        // Template buttons
        $$('.template-choice-btn', sheetApi.body).forEach((tBtn) => {
          tBtn.addEventListener('click', () => {
            const template = SPLIT_TEMPLATES.find((t) => t.key === tBtn.dataset.key);
            if (template) {
              currentSplit = splitFromTemplate(template);
              nameInput.value = currentSplit.name;
              $$('#split-type-toggle .toggle-btn', sheetApi.body).forEach((b) => {
                b.classList.toggle('active', b.dataset.type === currentSplit.type);
              });
              containerEl.innerHTML = renderSplitDaysListHtml();
              bindDaysListEvents();
              toast(`Loaded ${template.name} template`);
            }
          });
        });

        // Split type toggle
        $$('#split-type-toggle .toggle-btn', sheetApi.body).forEach((btn) => {
          btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            currentSplit.type = type;
            $$('#split-type-toggle .toggle-btn', sheetApi.body).forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            if (type === 'weekly' && currentSplit.days.length !== 7) {
              // Ensure 7 days for weekly
              const base = currentSplit.days;
              currentSplit.days = Array.from({ length: 7 }, (_, i) => base[i] || { id: uid(), name: `Day ${i + 1}`, rest: i === 6, exerciseIds: [] });
            }
            containerEl.innerHTML = renderSplitDaysListHtml();
            bindDaysListEvents();
          });
        });

        // Add day to rotation
        $('#btn-add-rotation-day', sheetApi.body)?.addEventListener('click', () => {
          currentSplit.days.push({
            id: uid(),
            name: `Day ${currentSplit.days.length + 1}`,
            rest: false,
            exerciseIds: [],
          });
          containerEl.innerHTML = renderSplitDaysListHtml();
          bindDaysListEvents();
        });

        // Save & Apply
        $('#btn-save-split-designer', sheetApi.body)?.addEventListener('click', async () => {
          currentSplit.name = nameInput.value.trim() || 'My Split';
          currentSplit.isActive = true;
          await repo.saveSplit(currentSplit);
          await repo.setActiveSplit(currentSplit.id);
          this.activeSplit = currentSplit;
          toast('Split saved & projected across calendar!', { type: 'success' });
          sheet.close();
          this.refresh();
        });

        bindDaysListEvents();
      },
    });
  }

  openManageSplitDayExercises(splitDay, allExercises, onSaved) {
    const selectedSet = new Set(splitDay.exerciseIds || []);

    const listHtml = allExercises.map((e) => {
      const isChecked = selectedSet.has(e.id);
      return `
        <label class="list-item exercise-checkbox-item">
          <input type="checkbox" class="ex-check" data-id="${e.id}" ${isChecked ? 'checked' : ''}>
          <div class="ex-check-info">
            <span class="badge badge-subtle">${esc(e.category)}</span>
            <span class="item-title">${esc(e.name)}</span>
          </div>
        </label>
      `;
    }).join('');

    const html = `
      <div class="manage-split-ex-wrap">
        <p class="text-subtle">Check all exercises you plan to perform on <strong>${esc(splitDay.name)}</strong>.</p>
        <div class="list ex-selection-list">
          ${listHtml}
        </div>
        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-save-split-ex">Done</button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: `${splitDay.name} Exercises`,
      html,
      onMount: (sheetApi) => {
        $('#btn-save-split-ex', sheetApi.body)?.addEventListener('click', () => {
          const checkedIds = $$('.ex-check:checked', sheetApi.body).map((c) => c.dataset.id);
          splitDay.exerciseIds = checkedIds;
          sheet.close();
          onSaved?.();
        });
      },
    });
  }

  openDayOverrideSheet(dateStr) {
    const splitDays = this.activeSplit?.days || [];
    const actions = splitDays.map((d) => ({
      label: `Switch to ${d.name} (${d.rest ? 'Rest' : `${d.exerciseIds?.length || 0} exercises`})`,
      onClick: async () => {
        await repo.setOverride(dateStr, clone(d));
        toast(`Set ${dateStr} to ${d.name}`);
        this.refresh();
      },
    }));

    actions.push({
      label: 'Reset to Default Schedule',
      danger: true,
      onClick: async () => {
        await repo.removeOverride(dateStr);
        toast(`Reset ${dateStr} schedule`);
        this.refresh();
      },
    });

    actionSheet({
      title: `Override Schedule for ${dateStr}`,
      actions,
    });
  }
}

export const dashboardView = new DashboardView();
