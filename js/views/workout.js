/* ==========================================================================
   Module 1: Live Workout Tracker
   - Active Session Stopwatch (Date.now() delta)
   - Categorized exercise library + custom exercise creation
   - Set, weight, rep logging with previous history memory
   - Automated rest timer trigger on set completion
   - Active workout persistence (never lost on refresh)
   ========================================================================== */

import { $, $$, num, round, esc, uid, dateKey, fmtDuration, fmtSet, convertWeight } from '../utils.js';
import { openSheet, confirmDialog, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { ticker, unlockAudio } from '../timers.js';
import { repo } from '../store/repository.js';
import { restTimer } from '../components/rest-timer.js';
import { CATEGORIES } from '../data/exercises.js';
import { openDayExerciseEditor } from '../components/day-exercise-editor.js';
import { triggerWidgetSync } from '../services/widget-sync.js';

class WorkoutView {
  container = null;
  activeWorkout = null;
  settings = null;
  unsubscribeTicker = null;

  async init(container) {
    this.container = container;
    this.settings = await repo.getSettings();
    this.activeWorkout = await repo.getActiveWorkout();

    this.render();
    this.bindEvents();

    this.unsubscribeTicker = ticker.add(() => this.updateStopwatch());
  }

  async refresh() {
    this.settings = await repo.getSettings();
    this.activeWorkout = await repo.getActiveWorkout();
    this.render();
  }

  render() {
    if (!this.activeWorkout) {
      this.renderIdleView();
    } else {
      this.renderLiveView();
    }
  }

  /* ------------------------------------------------------------------------
     IDLE VIEW (No active session)
     ------------------------------------------------------------------------ */
  async renderIdleView() {
    const plan = await repo.getPlanForDate(dateKey());
    const allExercises = await repo.getExercises();
    const exMap = new Map(allExercises.map((e) => [e.id, e]));
    const recentWorkouts = (await repo.getWorkouts()).slice(0, 5);
    const unit = this.settings.weightUnit || 'lbs';

    let todayBannerHtml = '';
    if (plan && plan.day && !plan.day.rest) {
      const plannedNames = (plan.day.exerciseIds || [])
        .map((id) => exMap.get(id)?.name)
        .filter(Boolean);

      todayBannerHtml = `
        <div class="card split-today-card">
          <div class="split-today-header">
            <div>
              <span class="badge badge-accent">Scheduled for Today</span>
              <h2 class="split-today-name">${esc(plan.day.name)}</h2>
              <div class="split-today-desc">${plannedNames.length} exercise${plannedNames.length === 1 ? '' : 's'} configured to auto-fill</div>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-configure-autofill" title="Configure what exercises auto-fill for this workout">
              ${icon('edit', 14)} Edit Exercises
            </button>
          </div>

          <div class="split-today-exercises-preview">
            ${plannedNames.length
              ? plannedNames.map((n) => `<span class="ex-chip">${esc(n)}</span>`).join('')
              : '<span class="text-subtle">No exercises assigned yet. Tap "Edit Exercises" to choose them.</span>'}
          </div>

          <div class="split-today-actions">
            <button class="btn btn-primary btn-large btn-block" id="btn-start-scheduled">
              ${icon('play', 18)} Start ${esc(plan.day.name)} Workout
            </button>
          </div>
        </div>
      `;
    }

    const recentListHtml = recentWorkouts.length === 0
      ? `
        <div class="empty-state-box">
          <p class="empty-state-title">No workouts logged yet</p>
          <p class="empty-state-desc">Start an empty workout or tap your scheduled split above to begin tracking.</p>
        </div>
      `
      : recentWorkouts.map((w) => {
          const totalVol = Math.round((w.exercises || []).reduce((t, e) =>
            t + (e.sets || []).reduce((s, x) => s + (x.completed ? (num(x.weight) * num(x.reps)) : 0), 0), 0));
          const totalSets = (w.exercises || []).reduce((t, e) => t + (e.sets || []).filter((s) => s.completed).length, 0);
          return `
            <div class="list-item workout-history-item" data-id="${w.id}">
              <div class="workout-history-main">
                <div class="item-title">${esc(w.title || 'Workout')}</div>
                <div class="item-meta">${w.date} · ${fmtDuration(w.durationMs || 0)} · ${totalSets} sets · ${totalVol.toLocaleString()} ${unit}</div>
              </div>
              <button class="icon-btn btn-repeat-workout" data-id="${w.id}" title="Repeat this workout" aria-label="Repeat workout">${icon('repeat', 18)}</button>
            </div>
          `;
        }).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Live Workout</h1>
        <button class="icon-btn" id="btn-quick-rest" title="Open Rest Timer" aria-label="Rest Timer">${icon('timer', 20)}</button>
      </div>

      <div class="view-content">
        ${todayBannerHtml}

        <div class="workout-start-card">
          <button class="btn btn-primary btn-large btn-block" id="btn-start-empty">
            ${icon('plus', 22)} Start Empty Workout
          </button>
        </div>

        <div class="workout-manage-splits-row">
          <button class="btn-text-accent btn-sm" id="btn-open-splits-from-workout">
            ${icon('layers', 14)} Configure Split Routines & Auto-fill Lists ↗
          </button>
        </div>

        <div class="section-header">
          <h2 class="section-title">Recent Workouts</h2>
        </div>
        <div class="list workout-recent-list">
          ${recentListHtml}
        </div>
      </div>
    `;

    $('#btn-start-empty', this.container)?.addEventListener('click', () => this.startNewWorkout());
    $('#btn-start-scheduled', this.container)?.addEventListener('click', () => {
      if (plan && plan.day) this.startWorkoutFromSplitDay(plan.day, plan.split);
    });

    $('#btn-configure-autofill', this.container)?.addEventListener('click', () => {
      if (plan && plan.day && plan.split) {
        openDayExerciseEditor({
          title: `${plan.day.name} Auto-fill Exercises`,
          dayName: plan.day.name,
          exerciseIds: plan.day.exerciseIds,
          onSave: async (ids) => {
            await repo.updateSplitDayExercises(plan.split.id, plan.day.id, ids);
            toast(`Updated exercises for ${plan.day.name}!`, { type: 'success' });
            await this.refresh();
          },
        });
      }
    });

    $('#btn-open-splits-from-workout', this.container)?.addEventListener('click', () => {
      document.querySelector('.tab[data-tab="dashboard"]')?.click();
      setTimeout(() => {
        document.querySelector('[data-act="open-designer"]')?.click();
      }, 100);
    });

    $('#btn-quick-rest', this.container)?.addEventListener('click', () => {
      restTimer.start(this.settings.defaultRestSec || 90);
    });

    $$('.btn-repeat-workout', this.container).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const w = await repo.getWorkout(btn.dataset.id);
        if (w) this.startWorkoutFromPrevious(w);
      });
    });

    $$('.workout-history-item', this.container).forEach((item) => {
      item.addEventListener('click', async () => {
        const w = await repo.getWorkout(item.dataset.id);
        if (w) this.showWorkoutDetailSheet(w);
      });
    });
  }

  /* ------------------------------------------------------------------------
     LIVE VIEW (Active session in progress)
     ------------------------------------------------------------------------ */
  renderLiveView() {
    const w = this.activeWorkout;
    const unit = this.settings.weightUnit || 'lbs';

    const exercisesHtml = (w.exercises || []).map((ex, exIdx) => {
      const setsHtml = (ex.sets || []).map((set, setIdx) => {
        const isDone = !!set.completed;
        const prevText = set.previousText || ex.previousHistoryText || '—';
        return `
          <tr class="set-row ${isDone ? 'set-completed' : ''}" data-ex-idx="${exIdx}" data-set-idx="${setIdx}">
            <td class="set-col-num">${setIdx + 1}</td>
            <td class="set-col-prev">${esc(prevText)}</td>
            <td class="set-col-input">
              <input type="number" class="set-input set-weight" inputmode="decimal" step="any"
                value="${set.weight !== undefined && set.weight !== null ? set.weight : ''}"
                placeholder="${set.placeholderWeight || '0'}"
                data-ex-idx="${exIdx}" data-set-idx="${setIdx}">
            </td>
            <td class="set-col-input">
              <input type="number" class="set-input set-reps" inputmode="numeric" step="1"
                value="${set.reps !== undefined && set.reps !== null ? set.reps : ''}"
                placeholder="${set.placeholderReps || '10'}"
                data-ex-idx="${exIdx}" data-set-idx="${setIdx}">
            </td>
            <td class="set-col-check">
              <button class="btn-check ${isDone ? 'checked' : ''}" data-ex-idx="${exIdx}" data-set-idx="${setIdx}" aria-label="Complete set">
                ${icon('check', 16)}
              </button>
            </td>
            <td class="set-col-action">
              <button class="icon-btn btn-delete-set" data-ex-idx="${exIdx}" data-set-idx="${setIdx}" title="Delete set" aria-label="Delete set">
                ${icon('trash', 14)}
              </button>
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div class="card exercise-card" data-ex-idx="${exIdx}">
          <div class="exercise-card-header">
            <div class="exercise-card-title-group">
              <span class="badge badge-subtle">${esc(ex.category || 'Exercise')}</span>
              <h3 class="exercise-title">${esc(ex.name)}</h3>
            </div>
            <button class="icon-btn btn-remove-ex" data-ex-idx="${exIdx}" title="Remove exercise" aria-label="Remove exercise">
              ${icon('x', 18)}
            </button>
          </div>

          ${ex.previousHistoryText ? `<div class="exercise-prev-banner">${icon('trophy', 14)} Last time: <strong>${esc(ex.previousHistoryText)}</strong></div>` : ''}

          <table class="sets-table">
            <thead>
              <tr>
                <th class="set-col-num">Set</th>
                <th class="set-col-prev">Previous</th>
                <th class="set-col-input">${unit.toUpperCase()}</th>
                <th class="set-col-input">Reps</th>
                <th class="set-col-check">✓</th>
                <th class="set-col-action"></th>
              </tr>
            </thead>
            <tbody>
              ${setsHtml}
            </tbody>
          </table>

          <div class="exercise-card-footer">
            <button class="btn btn-secondary btn-sm btn-add-set" data-ex-idx="${exIdx}">
              ${icon('plus', 16)} Add Set
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="live-workout-header">
        <div class="live-stopwatch-group">
          <span class="live-pulsing-dot"></span>
          <span class="live-stopwatch" id="live-stopwatch">0:00</span>
        </div>
        <div class="live-header-actions">
          <button class="btn btn-danger btn-sm" id="btn-discard-workout">Cancel</button>
          <button class="btn btn-accent btn-sm" id="btn-finish-workout">${icon('check', 16)} Finish</button>
        </div>
      </div>

      <div class="view-content live-workout-content">
        <div class="workout-title-row">
          <input type="text" id="workout-title-input" class="workout-title-input" value="${esc(w.title || 'Workout')}" placeholder="Workout Name">
          ${w.splitDayId ? `
            <button class="btn btn-secondary btn-sm" id="btn-save-as-autofill" title="Save these exercises as the auto-fill template for ${esc(w.splitDayName || 'this routine')}">
              ${icon('layers', 14)} Update ${esc(w.splitDayName)} Template
            </button>
          ` : ''}
        </div>

        <div class="exercises-stack" id="exercises-stack">
          ${exercisesHtml.length > 0 ? exercisesHtml : `
            <div class="empty-exercise-box">
              <p>No exercises added yet.</p>
              <p class="text-subtle">Tap "+ Add Exercise" below to begin logging.</p>
            </div>
          `}
        </div>

        <div class="workout-bottom-actions">
          <button class="btn btn-secondary btn-block" id="btn-add-exercise">
            ${icon('plus', 20)} Add Exercise
          </button>
        </div>
      </div>
    `;

    this.bindLiveEvents();
    this.updateStopwatch();
  }

  bindEvents() {
    // Top-level bindings if any
  }

  bindLiveEvents() {
    // 1. Title edit
    const titleInput = $('#workout-title-input', this.container);
    titleInput?.addEventListener('input', () => {
      if (this.activeWorkout) {
        this.activeWorkout.title = titleInput.value.trim() || 'Workout';
        repo.saveActiveWorkout(this.activeWorkout);
      }
    });

    $('#btn-save-as-autofill', this.container)?.addEventListener('click', async () => {
      const w = this.activeWorkout;
      if (!w?.splitDayId) return;
      const exerciseIds = (w.exercises || []).map((e) => e.exerciseId || e.id).filter(Boolean);
      const split = w.splitId ? await repo.adapter.get('splits', w.splitId) : await repo.getActiveSplit();
      if (split) {
        await repo.updateSplitDayExercises(split.id, w.splitDayId, exerciseIds);
        toast(`Updated ${w.splitDayName || 'routine'} auto-fill list (${exerciseIds.length} exercises)`, { type: 'success' });
      }
    });

    // 2. Add Exercise button
    $('#btn-add-exercise', this.container)?.addEventListener('click', () => {
      this.openExercisePickerSheet();
    });

    // 3. Discard workout
    $('#btn-discard-workout', this.container)?.addEventListener('click', async () => {
      const ok = await confirmDialog('Are you sure you want to discard this in-progress workout? Your logged sets will be lost.', {
        title: 'Discard Workout',
        okText: 'Discard',
        danger: true,
      });
      if (ok) {
        await repo.clearActiveWorkout();
        this.activeWorkout = null;
        restTimer.stop();
        toast('Workout discarded');
        this.render();
      }
    });

    // 4. Finish workout
    $('#btn-finish-workout', this.container)?.addEventListener('click', () => {
      this.finishWorkout();
    });

    // 5. Weight & Rep input changes
    $$('.set-weight', this.container).forEach((input) => {
      input.addEventListener('input', () => {
        const exIdx = Number(input.dataset.exIdx);
        const setIdx = Number(input.dataset.setIdx);
        if (this.activeWorkout?.exercises?.[exIdx]?.sets?.[setIdx]) {
          this.activeWorkout.exercises[exIdx].sets[setIdx].weight = input.value === '' ? '' : num(input.value);
          repo.saveActiveWorkout(this.activeWorkout);
        }
      });
    });

    $$('.set-reps', this.container).forEach((input) => {
      input.addEventListener('input', () => {
        const exIdx = Number(input.dataset.exIdx);
        const setIdx = Number(input.dataset.setIdx);
        if (this.activeWorkout?.exercises?.[exIdx]?.sets?.[setIdx]) {
          this.activeWorkout.exercises[exIdx].sets[setIdx].reps = input.value === '' ? '' : num(input.value);
          repo.saveActiveWorkout(this.activeWorkout);
        }
      });
    });

    // 6. Complete set button
    $$('.btn-check', this.container).forEach((btn) => {
      btn.addEventListener('click', () => {
        unlockAudio();
        const exIdx = Number(btn.dataset.exIdx);
        const setIdx = Number(btn.dataset.setIdx);
        const setObj = this.activeWorkout?.exercises?.[exIdx]?.sets?.[setIdx];
        if (!setObj) return;

        // Auto-fill values from placeholder if user left inputs blank
        const row = btn.closest('.set-row');
        const weightInput = $('.set-weight', row);
        const repsInput = $('.set-reps', row);

        if (setObj.weight === '' || setObj.weight === undefined) {
          setObj.weight = num(weightInput.placeholder || 0);
          weightInput.value = setObj.weight;
        }
        if (setObj.reps === '' || setObj.reps === undefined) {
          setObj.reps = num(repsInput.placeholder || 10);
          repsInput.value = setObj.reps;
        }

        const wasCompleted = !!setObj.completed;
        setObj.completed = !wasCompleted;

        if (setObj.completed) {
          haptic([25, 40]);
          row.classList.add('set-completed');
          btn.classList.add('checked');

          // CRITICAL: Trigger automated rest timer!
          if (this.settings.autoStartRest !== false) {
            const restSeconds = this.settings.defaultRestSec || 90;
            restTimer.start(restSeconds);
          }
        } else {
          row.classList.remove('set-completed');
          btn.classList.remove('checked');
        }

        repo.saveActiveWorkout(this.activeWorkout);
      });
    });

    // 7. Add set button
    $$('.btn-add-set', this.container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const exIdx = Number(btn.dataset.exIdx);
        const ex = this.activeWorkout?.exercises?.[exIdx];
        if (!ex) return;

        // Duplicate weight & reps from previous set if present
        const prevSet = ex.sets[ex.sets.length - 1];
        const newSet = {
          id: uid(),
          weight: prevSet?.weight !== undefined ? prevSet.weight : '',
          reps: prevSet?.reps !== undefined ? prevSet.reps : '',
          unit: this.settings.weightUnit || 'lbs',
          placeholderWeight: prevSet?.weight || prevSet?.placeholderWeight || '0',
          placeholderReps: prevSet?.reps || prevSet?.placeholderReps || '10',
          previousText: ex.previousHistoryText || '—',
          completed: false,
        };

        ex.sets.push(newSet);
        repo.saveActiveWorkout(this.activeWorkout);
        this.renderLiveView();
      });
    });

    // 8. Delete set button
    $$('.btn-delete-set', this.container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const exIdx = Number(btn.dataset.exIdx);
        const setIdx = Number(btn.dataset.setIdx);
        const ex = this.activeWorkout?.exercises?.[exIdx];
        if (!ex) return;

        if (ex.sets.length > 1) {
          ex.sets.splice(setIdx, 1);
        } else {
          // If only 1 set remains, clear its inputs
          ex.sets[0] = {
            id: uid(),
            weight: '',
            reps: '',
            unit: this.settings.weightUnit || 'lbs',
            completed: false,
          };
        }
        repo.saveActiveWorkout(this.activeWorkout);
        this.renderLiveView();
      });
    });

    // 9. Remove exercise button
    $$('.btn-remove-ex', this.container).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const exIdx = Number(btn.dataset.exIdx);
        const ex = this.activeWorkout?.exercises?.[exIdx];
        const ok = await confirmDialog(`Remove ${ex?.name || 'this exercise'} from workout?`, {
          title: 'Remove Exercise',
          okText: 'Remove',
          danger: true,
        });
        if (ok) {
          this.activeWorkout.exercises.splice(exIdx, 1);
          repo.saveActiveWorkout(this.activeWorkout);
          this.renderLiveView();
        }
      });
    });
  }

  updateStopwatch() {
    if (!this.activeWorkout || !this.activeWorkout.startedAt) return;
    const el = $('#live-stopwatch', this.container);
    if (!el) return;
    const elapsedMs = Math.max(0, Date.now() - this.activeWorkout.startedAt);
    el.textContent = fmtDuration(elapsedMs);
  }

  /* ------------------------------------------------------------------------
     WORKOUT CREATION & HISTORY PREFILL
     ------------------------------------------------------------------------ */
  async startNewWorkout({ title = 'Workout', initialExercises = [] } = {}) {
    unlockAudio();
    const unit = this.settings.weightUnit || 'lbs';

    const workout = {
      id: uid(),
      title,
      date: dateKey(),
      startedAt: Date.now(),
      unit,
      exercises: [],
    };

    if (initialExercises.length > 0) {
      for (const exDef of initialExercises) {
        const built = await this.buildExerciseEntry(exDef);
        workout.exercises.push(built);
      }
    }

    this.activeWorkout = workout;
    await repo.saveActiveWorkout(workout);
    this.render();
    toast(`Started ${title}`);
  }

  async startWorkoutFromSplitDay(splitDay, split = null) {
    const allExercises = await repo.getExercises();
    const exMap = new Map(allExercises.map((e) => [e.id, e]));

    const plannedExercises = (splitDay.exerciseIds || [])
      .map((id) => exMap.get(id))
      .filter(Boolean);

    await this.startNewWorkout({
      title: `${splitDay.name} Workout`,
      initialExercises: plannedExercises,
    });

    if (this.activeWorkout && splitDay) {
      this.activeWorkout.splitDayId = splitDay.id;
      this.activeWorkout.splitDayName = splitDay.name;
      this.activeWorkout.splitId = split?.id || null;
      await repo.saveActiveWorkout(this.activeWorkout);
      this.renderLiveView();
    }
  }

  async startWorkoutFromPrevious(prevWorkout) {
    const allExercises = await repo.getExercises();
    const exMap = new Map(allExercises.map((e) => [e.id, e]));

    const initialExercises = (prevWorkout.exercises || []).map((e) => {
      const match = exMap.get(e.exerciseId || e.id);
      return match || { id: e.exerciseId || e.id, name: e.name, category: e.category || 'Compound' };
    });

    await this.startNewWorkout({
      title: prevWorkout.title || 'Workout',
      initialExercises,
    });
  }

  /**
   * CRITICAL FEATURE:
   * Build an exercise entry and query the user's workout history to prefill
   * the exact weight and reps lifted last time.
   */
  async buildExerciseEntry(exerciseDoc) {
    const unit = this.settings.weightUnit || 'lbs';
    const lastPerf = await repo.getLastPerformanceForExercise(exerciseDoc.id);

    let prevText = '';
    let placeholderW = '0';
    let placeholderR = '10';

    if (lastPerf) {
      // Convert history weight to user's current unit preference if needed
      const convertedW = convertWeight(lastPerf.weight, lastPerf.unit, unit);
      prevText = `${round(convertedW, 1)} ${unit} × ${lastPerf.reps}`;
      placeholderW = String(round(convertedW, 1));
      placeholderR = String(lastPerf.reps);
    }

    // Default 3 sets
    const sets = [1, 2, 3].map((setNum) => {
      // If we have history for this specific set number, use it
      let setPrevText = prevText;
      let setPlaceholderW = placeholderW;
      let setPlaceholderR = placeholderR;

      if (lastPerf?.allSets && lastPerf.allSets[setNum - 1]) {
        const s = lastPerf.allSets[setNum - 1];
        const cW = convertWeight(s.weight, s.unit, unit);
        setPrevText = `${round(cW, 1)} ${unit} × ${s.reps}`;
        setPlaceholderW = String(round(cW, 1));
        setPlaceholderR = String(s.reps);
      }

      return {
        id: uid(),
        weight: '',
        reps: '',
        unit,
        placeholderWeight: setPlaceholderW,
        placeholderReps: setPlaceholderR,
        previousText: setPrevText || '—',
        completed: false,
      };
    });

    return {
      exerciseId: exerciseDoc.id,
      name: exerciseDoc.name,
      category: exerciseDoc.category || 'Compound',
      previousHistoryText: prevText,
      sets,
    };
  }

  /* ------------------------------------------------------------------------
     EXERCISE PICKER & CUSTOM EXERCISE MODAL
     ------------------------------------------------------------------------ */
  async openExercisePickerSheet() {
    const exercises = await repo.getExercises();

    let activeFilter = 'All';
    let searchQuery = '';

    const filterList = () => {
      return exercises.filter((e) => {
        const matchesCategory = activeFilter === 'All' || e.category === activeFilter;
        const matchesSearch = !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      });
    };

    const renderListHtml = () => {
      const list = filterList();
      if (list.length === 0) {
        return `<div class="empty-state-text">No exercises found.<br><button class="btn btn-secondary btn-sm mt-2" id="btn-create-custom-inline">+ Create "${esc(searchQuery)}"</button></div>`;
      }
      return list.map((e) => `
        <button class="list-item exercise-picker-item" data-id="${e.id}">
          <div class="exercise-picker-meta">
            <span class="badge badge-subtle">${esc(e.category)}</span>
            <span class="exercise-name">${esc(e.name)}</span>
          </div>
          <span class="exercise-picker-add">${icon('plus', 18)}</span>
        </button>
      `).join('');
    };

    const categoriesHtml = ['All', ...CATEGORIES].map((c) => `
      <button class="filter-pill ${c === activeFilter ? 'active' : ''}" data-cat="${c}">${c}</button>
    `).join('');

    const html = `
      <div class="exercise-picker-wrap">
        <div class="search-input-wrap">
          ${icon('search', 16, 'search-icon')}
          <input type="text" id="exercise-search" class="text-input search-input" placeholder="Search exercises...">
        </div>

        <div class="filter-pills-row" id="category-pills">
          ${categoriesHtml}
        </div>

        <div class="exercise-picker-actions">
          <button class="btn btn-secondary btn-sm btn-block" id="btn-open-custom-modal">
            ${icon('plus', 16)} Create Custom Exercise
          </button>
        </div>

        <div class="list exercise-picker-list" id="picker-results">
          ${renderListHtml()}
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'Add Exercise',
      html,
      onMount: (sheetApi) => {
        const searchInput = $('#exercise-search', sheetApi.body);
        const resultsEl = $('#picker-results', sheetApi.body);
        const pillsWrap = $('#category-pills', sheetApi.body);

        const updateList = () => {
          resultsEl.innerHTML = renderListHtml();
          bindItemClicks();
        };

        searchInput?.addEventListener('input', () => {
          searchQuery = searchInput.value.trim();
          updateList();
        });

        pillsWrap?.addEventListener('click', (e) => {
          const pill = e.target.closest('.filter-pill');
          if (!pill) return;
          $$('.filter-pill', pillsWrap).forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          activeFilter = pill.dataset.cat;
          updateList();
        });

        const selectExercise = async (exerciseDoc) => {
          sheet.close();
          const built = await this.buildExerciseEntry(exerciseDoc);
          if (!this.activeWorkout) {
            await this.startNewWorkout({ initialExercises: [exerciseDoc] });
          } else {
            this.activeWorkout.exercises.push(built);
            await repo.saveActiveWorkout(this.activeWorkout);
            this.renderLiveView();
          }
          toast(`Added ${exerciseDoc.name}`);
        };

        const bindItemClicks = () => {
          $$('.exercise-picker-item', resultsEl).forEach((btn) => {
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              const found = exercises.find((x) => x.id === id);
              if (found) selectExercise(found);
            });
          });

          $('#btn-create-custom-inline', resultsEl)?.addEventListener('click', () => {
            this.openCreateCustomModal(searchQuery, (newEx) => selectExercise(newEx));
          });
        };

        $('#btn-open-custom-modal', sheetApi.body)?.addEventListener('click', () => {
          this.openCreateCustomModal('', (newEx) => selectExercise(newEx));
        });

        bindItemClicks();
      },
    });
  }

  openCreateCustomModal(initialName = '', onCreated) {
    const categoryOptions = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');

    const html = `
      <div class="custom-exercise-form">
        <div class="form-group">
          <label>Exercise Name</label>
          <input type="text" id="custom-ex-name" class="text-input" value="${esc(initialName)}" placeholder="e.g. Bulgarian Split Squat">
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="custom-ex-cat" class="text-input select-input">
            ${categoryOptions}
          </select>
        </div>
        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-save-custom-ex">${icon('plus', 18)} Save & Add</button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'Create Custom Exercise',
      html,
      onMount: (sheetApi) => {
        $('#btn-save-custom-ex', sheetApi.body)?.addEventListener('click', async () => {
          const name = $('#custom-ex-name', sheetApi.body)?.value?.trim();
          const category = $('#custom-ex-cat', sheetApi.body)?.value || 'Compound';
          if (!name) {
            toast('Please enter an exercise name', { type: 'warn' });
            return;
          }

          try {
            const created = await repo.addExercise({ name, category, isCustom: true });
            sheet.close();
            onCreated?.(created);
          } catch (err) {
            toast(err.message, { type: 'danger' });
          }
        });
      },
    });
  }

  /* ------------------------------------------------------------------------
     FINISH WORKOUT & PERSISTENCE
     ------------------------------------------------------------------------ */
  async finishWorkout() {
    if (!this.activeWorkout) return;
    const w = this.activeWorkout;
    const unit = this.settings.weightUnit || 'lbs';

    // Count completed sets & volume
    let completedSetsCount = 0;
    let totalVolume = 0;

    (w.exercises || []).forEach((e) => {
      (e.sets || []).forEach((s) => {
        if (s.completed) {
          completedSetsCount++;
          totalVolume += num(s.weight) * num(s.reps);
        }
      });
    });

    if (completedSetsCount === 0) {
      const proceed = await confirmDialog('You have not checked off any completed sets. Finish anyway?', {
        title: 'No Completed Sets',
        okText: 'Finish Anyway',
      });
      if (!proceed) return;
    }

    const durationMs = Math.max(1000, Date.now() - w.startedAt);
    const finishedWorkout = {
      ...w,
      endedAt: Date.now(),
      durationMs,
      completedSetsCount,
      totalVolume,
    };

    await repo.saveWorkout(finishedWorkout);
    await repo.clearActiveWorkout();
    this.activeWorkout = null;
    restTimer.stop();
    triggerWidgetSync();

    haptic([50, 80, 50]);
    toast(`Workout saved! ${fmtDuration(durationMs)} · ${totalVolume.toLocaleString()} ${unit}`, { type: 'success', duration: 4000 });
    this.render();
  }

  showWorkoutDetailSheet(workout) {
    const unit = workout.unit || this.settings.weightUnit || 'lbs';
    const exercisesHtml = (workout.exercises || []).map((e) => {
      const setsHtml = (e.sets || []).map((s, i) => `
        <div class="summary-set-row">
          <span class="summary-set-num">Set ${i + 1}</span>
          <span class="summary-set-val">${fmtSet(s, unit)}</span>
        </div>
      `).join('');

      return `
        <div class="summary-exercise-block">
          <div class="summary-exercise-title">${esc(e.name)}</div>
          <div class="summary-sets-list">${setsHtml}</div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="workout-summary-view">
        <div class="summary-stats-banner">
          <div class="summary-stat">
            <span class="stat-label">Duration</span>
            <span class="stat-val">${fmtDuration(workout.durationMs || 0)}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-label">Volume</span>
            <span class="stat-val">${Math.round(workout.totalVolume || 0).toLocaleString()} ${unit}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-label">Date</span>
            <span class="stat-val">${workout.date}</span>
          </div>
        </div>

        <div class="summary-exercises-wrap">
          ${exercisesHtml}
        </div>

        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-repeat-this-modal">
            ${icon('repeat', 18)} Start This Workout Again
          </button>
          <button class="btn btn-danger btn-block" id="btn-delete-this-workout">
            ${icon('trash', 18)} Delete Workout Log
          </button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: workout.title || 'Workout Summary',
      html,
      onMount: (sheetApi) => {
        $('#btn-repeat-this-modal', sheetApi.body)?.addEventListener('click', () => {
          sheet.close();
          this.startWorkoutFromPrevious(workout);
        });

        $('#btn-delete-this-workout', sheetApi.body)?.addEventListener('click', async () => {
          const ok = await confirmDialog('Permanently delete this workout from your history?', {
            title: 'Delete Workout',
            okText: 'Delete',
            danger: true,
          });
          if (ok) {
            await repo.deleteWorkout(workout.id);
            toast('Workout deleted');
            sheet.close();
            this.render();
          }
        });
      },
    });
  }

  async getTodayScheduledSplitDay() {
    const activeSplit = await repo.getActiveSplit();
    if (!activeSplit || !activeSplit.days || activeSplit.days.length === 0) return null;

    const todayStr = dateKey();
    const override = await repo.getOverride(todayStr);
    if (override) return override;

    if (activeSplit.type === 'weekly') {
      const dayOfWeek = (new Date().getDay() + 6) % 7; // 0=Mon, 6=Sun
      return activeSplit.days[dayOfWeek] || null;
    } else {
      // Rotation
      const start = activeSplit.startDate ? new Date(activeSplit.startDate + 'T00:00:00') : new Date();
      const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000);
      const cycleLen = activeSplit.days.length;
      const index = ((diffDays % cycleLen) + cycleLen) % cycleLen;
      return activeSplit.days[index] || null;
    }
  }
}

export const workoutView = new WorkoutView();
