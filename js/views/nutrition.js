/* ==========================================================================
   Module 2: Streamlined Nutrition Tracker (STRICTLY 4 METRICS ONLY)
   - Calories (kcal), Protein (g), Sugar (g), Sodium (mg)
   - Circular/bar progress vs daily goals
   - Barcode Scanner (Open Food Facts API)
   - AI Meal Photo Estimator (Gemini 2.5 Flash)
   - Quick-Add & Saved Staples (1-tap logging)
   - Manual entry & day-by-day browsing
   ========================================================================== */

import { $, $$, num, round, esc, dateKey, parseDateKey, addDays, friendlyDate, fmtTime } from '../utils.js';
import { openSheet, actionSheet, confirmDialog, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { repo } from '../store/repository.js';
import { METRICS, fmtMetric, metricStatus } from '../data/metrics.js';
import { barcodeScanner } from '../components/barcode-scanner.js';
import { mealAi } from '../components/meal-ai.js';
import { triggerWidgetSync } from '../services/widget-sync.js';

class NutritionView {
  container = null;
  selectedDate = dateKey();
  settings = null;
  foodLogs = [];
  staples = [];

  async init(container) {
    this.container = container;
    mealAi.init({ onLogged: () => this.refresh() });
    await this.refresh();
  }

  async refresh() {
    this.settings = await repo.getSettings();
    this.foodLogs = await repo.getFoodLog(this.selectedDate);
    this.staples = await repo.getStaples();
    this.render();
    if (this.selectedDate === dateKey()) {
      triggerWidgetSync();
    }
  }

  render() {
    const totals = this.calculateTotals();
    const isToday = this.selectedDate === dateKey();

    // 4 Metrics Cards HTML
    const metricsCardsHtml = METRICS.map((m) => {
      const val = totals[m.key] || 0;
      const goalKey = `${m.key}Goal`;
      const goal = this.settings[goalKey] || 0;
      const status = metricStatus(m, val, goal);
      const pctClamped = Math.min(100, Math.round(status.pct * 100));

      return `
        <div class="nutri-card" style="--metric-color: ${status.color}">
          <div class="nutri-card-top">
            <span class="nutri-metric-name">${esc(m.label)}</span>
            <span class="nutri-status-text">${esc(status.text)}</span>
          </div>
          <div class="nutri-card-middle">
            <span class="nutri-current-val">${fmtMetric(m, val, false)}</span>
            <span class="nutri-goal-val">/ ${fmtMetric(m, goal)}</span>
          </div>
          <div class="nutri-progress-track">
            <div class="nutri-progress-fill" style="width: ${pctClamped}%; background: ${status.color}"></div>
          </div>
        </div>
      `;
    }).join('');

    // Food list grouped or empty
    const listHtml = this.foodLogs.length === 0
      ? `
        <div class="empty-state-box">
          <p class="empty-state-title">No food logged for ${friendlyDate(this.selectedDate).toLowerCase()}</p>
          <p class="empty-state-desc">Scan a barcode, snap a meal photo, or pick from saved staples to track your 4 metrics.</p>
        </div>
      `
      : this.foodLogs.map((item) => `
        <div class="list-item food-item" data-id="${item.id}">
          <div class="food-item-left">
            <div class="food-item-name-row">
              <span class="badge badge-subtle">${esc(item.mealType || 'Meal')}</span>
              <span class="food-item-name">${esc(item.name)}</span>
            </div>
            <div class="food-item-serving">${esc(item.serving || '1 serving')} · ${fmtTime(item.timestamp)}</div>
          </div>
          <div class="food-item-right">
            <div class="food-chip food-chip-cal">${Math.round(item.calories)} kcal</div>
            <div class="food-chip food-chip-pro">${round(item.protein, 1)}g pro</div>
            <div class="food-chip food-chip-sug">${round(item.sugar, 1)}g sug</div>
            <div class="food-chip food-chip-sod">${Math.round(item.sodium)}mg sod</div>
          </div>
        </div>
      `).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Nutrition</h1>
        <div class="date-navigator">
          <button class="icon-btn" id="btn-prev-day" aria-label="Previous day">${icon('chevronLeft', 20)}</button>
          <button class="btn-date-label" id="btn-jump-today">${friendlyDate(this.selectedDate)}</button>
          <button class="icon-btn" id="btn-next-day" aria-label="Next day">${icon('chevronRight', 20)}</button>
        </div>
      </div>

      <div class="view-content">
        <!-- 4 METRICS ONLY DASHBOARD -->
        <div class="nutrition-dashboard-grid">
          ${metricsCardsHtml}
        </div>

        <!-- 4 QUICK ACTION BUTTONS -->
        <div class="nutrition-actions-row">
          <button class="nutri-action-btn" id="btn-scan-barcode">
            <span class="nutri-action-icon">${icon('barcode', 22)}</span>
            <span class="nutri-action-label">Scan Barcode</span>
          </button>
          <button class="nutri-action-btn" id="btn-snap-photo">
            <span class="nutri-action-icon">${icon('camera', 22)}</span>
            <span class="nutri-action-label">Snap Photo</span>
          </button>
          <button class="nutri-action-btn" id="btn-open-staples">
            <span class="nutri-action-icon">${icon('star', 22)}</span>
            <span class="nutri-action-label">Staples</span>
          </button>
          <button class="nutri-action-btn" id="btn-manual-entry">
            <span class="nutri-action-icon">${icon('plus', 22)}</span>
            <span class="nutri-action-label">Manual</span>
          </button>
        </div>

        <div class="section-header">
          <h2 class="section-title">Today's Log (${this.foodLogs.length})</h2>
          ${this.foodLogs.length > 0 ? `<button class="btn-text-accent" id="btn-clear-day">Clear Day</button>` : ''}
        </div>

        <div class="list food-log-list">
          ${listHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // 1. Date navigation
    $('#btn-prev-day', this.container)?.addEventListener('click', () => {
      const cur = parseDateKey(this.selectedDate);
      this.selectedDate = dateKey(addDays(cur, -1));
      this.refresh();
    });

    $('#btn-next-day', this.container)?.addEventListener('click', () => {
      const cur = parseDateKey(this.selectedDate);
      this.selectedDate = dateKey(addDays(cur, 1));
      this.refresh();
    });

    $('#btn-jump-today', this.container)?.addEventListener('click', () => {
      this.selectedDate = dateKey();
      this.refresh();
    });

    // 2. Barcode scanner
    $('#btn-scan-barcode', this.container)?.addEventListener('click', () => {
      barcodeScanner.open({ onLogged: () => this.refresh() });
    });

    // 3. AI meal photo
    $('#btn-snap-photo', this.container)?.addEventListener('click', () => {
      mealAi.triggerPhotoCapture();
    });

    // 4. Saved Staples
    $('#btn-open-staples', this.container)?.addEventListener('click', () => {
      this.openStaplesSheet();
    });

    // 5. Manual entry
    $('#btn-manual-entry', this.container)?.addEventListener('click', () => {
      this.openManualEntrySheet();
    });

    // 6. Food item tap (edit / delete / save staple)
    $$('.food-item', this.container).forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const item = this.foodLogs.find((f) => f.id === id);
        if (item) this.openItemOptionsSheet(item);
      });
    });

    // 7. Clear Day
    $('#btn-clear-day', this.container)?.addEventListener('click', async () => {
      const ok = await confirmDialog(`Remove all ${this.foodLogs.length} food items logged for ${friendlyDate(this.selectedDate)}?`, {
        title: 'Clear Day Log',
        okText: 'Clear All',
        danger: true,
      });
      if (ok) {
        for (const item of this.foodLogs) {
          await repo.removeFoodLogItem(item.id);
        }
        toast('Food log cleared');
        this.refresh();
      }
    });
  }

  calculateTotals() {
    return this.foodLogs.reduce((acc, f) => {
      acc.calories += num(f.calories);
      acc.protein += num(f.protein);
      acc.sugar += num(f.sugar);
      acc.sodium += num(f.sodium);
      return acc;
    }, { calories: 0, protein: 0, sugar: 0, sodium: 0 });
  }

  /* ------------------------------------------------------------------------
     SAVED STAPLES MODAL (1-Tap Logging)
     ------------------------------------------------------------------------ */
  async openStaplesSheet() {
    this.staples = await repo.getStaples();

    const renderStaplesHtml = () => {
      if (this.staples.length === 0) {
        return `<div class="empty-state-text">No saved staples yet. Add your favorite high-protein meals or snacks!</div>`;
      }
      return this.staples.map((s) => `
        <div class="list-item staple-item" data-id="${s.id}">
          <div class="staple-info">
            <div class="item-title">${esc(s.name)}</div>
            <div class="item-meta">${esc(s.serving)} · ${Math.round(s.calories)} kcal · ${round(s.protein, 1)}g pro · ${round(s.sugar, 1)}g sug · ${Math.round(s.sodium)}mg sod</div>
          </div>
          <div class="staple-actions">
            <button class="btn btn-primary btn-sm btn-log-staple" data-id="${s.id}">+ Log</button>
            <button class="icon-btn btn-del-staple" data-id="${s.id}" title="Delete staple" aria-label="Delete staple">${icon('trash', 16)}</button>
          </div>
        </div>
      `).join('');
    };

    const html = `
      <div class="staples-sheet-wrap">
        <div class="staples-header-actions">
          <p class="text-subtle">1-tap to log your frequent staples</p>
          <button class="btn btn-secondary btn-sm" id="btn-add-new-staple">${icon('plus', 16)} New Staple</button>
        </div>
        <div class="list staples-list" id="staples-list-container">
          ${renderStaplesHtml()}
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'Saved Staples',
      html,
      onMount: (sheetApi) => {
        const bindStapleButtons = () => {
          $$('.btn-log-staple', sheetApi.body).forEach((btn) => {
            btn.addEventListener('click', async () => {
              const staple = this.staples.find((s) => s.id === btn.dataset.id);
              if (staple) {
                haptic(30);
                await repo.addFoodLogItem({
                  name: staple.name,
                  serving: staple.serving,
                  calories: staple.calories,
                  protein: staple.protein,
                  sugar: staple.sugar,
                  sodium: staple.sodium,
                  mealType: 'Meal',
                  date: this.selectedDate,
                });
                toast(`Logged 1x ${staple.name}!`, { type: 'success' });
                this.refresh();
              }
            });
          });

          $$('.btn-del-staple', sheetApi.body).forEach((btn) => {
            btn.addEventListener('click', async () => {
              const staple = this.staples.find((s) => s.id === btn.dataset.id);
              const ok = await confirmDialog(`Delete "${staple?.name}" from saved staples?`, {
                title: 'Delete Staple',
                okText: 'Delete',
                danger: true,
              });
              if (ok) {
                await repo.deleteStaple(btn.dataset.id);
                this.staples = await repo.getStaples();
                const listWrap = $('#staples-list-container', sheetApi.body);
                if (listWrap) {
                  listWrap.innerHTML = renderStaplesHtml();
                  bindStapleButtons();
                }
              }
            });
          });
        };

        $('#btn-add-new-staple', sheetApi.body)?.addEventListener('click', () => {
          this.openCreateStapleModal(async () => {
            this.staples = await repo.getStaples();
            const listWrap = $('#staples-list-container', sheetApi.body);
            if (listWrap) {
              listWrap.innerHTML = renderStaplesHtml();
              bindStapleButtons();
            }
          });
        });

        bindStapleButtons();
      },
    });
  }

  openCreateStapleModal(onSaved) {
    const html = `
      <div class="food-edit-form">
        <div class="form-group">
          <label>Staple Name</label>
          <input type="text" id="staple-name" class="text-input" placeholder="e.g. Whey Protein Shake">
        </div>
        <div class="form-group">
          <label>Serving Description</label>
          <input type="text" id="staple-serving" class="text-input" placeholder="e.g. 1 scoop (35g)">
        </div>
        <div class="nutrition-grid-4">
          <div class="nutri-cell">
            <span class="nutri-label">Calories</span>
            <input type="number" id="staple-cal" class="text-input mini-input" placeholder="0">
            <span class="nutri-unit">kcal</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Protein</span>
            <input type="number" id="staple-pro" class="text-input mini-input" placeholder="0" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sugar</span>
            <input type="number" id="staple-sug" class="text-input mini-input" placeholder="0" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sodium</span>
            <input type="number" id="staple-sod" class="text-input mini-input" placeholder="0" step="10">
            <span class="nutri-unit">mg</span>
          </div>
        </div>
        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-save-staple-modal">Save Staple</button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'New Staple Food',
      html,
      onMount: (sheetApi) => {
        $('#btn-save-staple-modal', sheetApi.body)?.addEventListener('click', async () => {
          const name = $('#staple-name', sheetApi.body)?.value?.trim();
          if (!name) {
            toast('Please enter a name for the staple', { type: 'warn' });
            return;
          }
          await repo.saveStaple({
            name,
            serving: $('#staple-serving', sheetApi.body)?.value?.trim() || '1 serving',
            calories: num($('#staple-cal', sheetApi.body)?.value),
            protein: num($('#staple-pro', sheetApi.body)?.value),
            sugar: num($('#staple-sug', sheetApi.body)?.value),
            sodium: num($('#staple-sod', sheetApi.body)?.value),
          });
          toast('Staple created!');
          sheet.close();
          onSaved?.();
        });
      },
    });
  }

  /* ------------------------------------------------------------------------
     MANUAL FOOD LOGGING SHEET
     ------------------------------------------------------------------------ */
  openManualEntrySheet(initialData = null) {
    const isEdit = !!initialData;
    const d = initialData || {
      name: '',
      serving: '1 serving',
      mealType: 'Lunch',
      calories: '',
      protein: '',
      sugar: '',
      sodium: '',
    };

    const html = `
      <div class="food-edit-form">
        <div class="form-group">
          <label>Food / Meal Name</label>
          <input type="text" id="manual-name" class="text-input" value="${esc(d.name)}" placeholder="e.g. Steak & Sweet Potato">
        </div>

        <div class="form-row">
          <div class="form-group flex-1">
            <label>Meal Type</label>
            <select id="manual-meal-type" class="text-input select-input">
              <option value="Breakfast" ${d.mealType === 'Breakfast' ? 'selected' : ''}>Breakfast</option>
              <option value="Lunch" ${d.mealType === 'Lunch' ? 'selected' : ''}>Lunch</option>
              <option value="Dinner" ${d.mealType === 'Dinner' ? 'selected' : ''}>Dinner</option>
              <option value="Snack" ${d.mealType === 'Snack' ? 'selected' : ''}>Snack</option>
            </select>
          </div>
          <div class="form-group flex-1">
            <label>Portion / Serving</label>
            <input type="text" id="manual-serving" class="text-input" value="${esc(d.serving)}" placeholder="e.g. 200g">
          </div>
        </div>

        <div class="nutrition-grid-4">
          <div class="nutri-cell">
            <span class="nutri-label">Calories</span>
            <input type="number" id="manual-cal" class="text-input mini-input" value="${d.calories}" placeholder="0">
            <span class="nutri-unit">kcal</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Protein</span>
            <input type="number" id="manual-pro" class="text-input mini-input" value="${d.protein}" placeholder="0" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sugar</span>
            <input type="number" id="manual-sug" class="text-input mini-input" value="${d.sugar}" placeholder="0" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sodium</span>
            <input type="number" id="manual-sod" class="text-input mini-input" value="${d.sodium}" placeholder="0" step="10">
            <span class="nutri-unit">mg</span>
          </div>
        </div>

        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-save-manual">${icon('check', 18)} ${isEdit ? 'Update Entry' : 'Add to Food Log'}</button>
          ${!isEdit ? `<button class="btn btn-secondary btn-block" id="btn-save-manual-staple">${icon('star', 18)} Save as Staple & Log</button>` : ''}
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: isEdit ? 'Edit Food Log' : 'Manual Food Entry',
      html,
      onMount: (sheetApi) => {
        const getPayload = () => ({
          ...(initialData || {}),
          date: this.selectedDate,
          name: $('#manual-name', sheetApi.body)?.value?.trim() || 'Food Item',
          serving: $('#manual-serving', sheetApi.body)?.value?.trim() || '1 serving',
          mealType: $('#manual-meal-type', sheetApi.body)?.value || 'Meal',
          calories: num($('#manual-cal', sheetApi.body)?.value),
          protein: num($('#manual-pro', sheetApi.body)?.value),
          sugar: num($('#manual-sug', sheetApi.body)?.value),
          sodium: num($('#manual-sod', sheetApi.body)?.value),
        });

        $('#btn-save-manual', sheetApi.body)?.addEventListener('click', async () => {
          const payload = getPayload();
          if (isEdit) {
            await repo.updateFoodLogItem(payload);
            toast('Entry updated', { type: 'success' });
          } else {
            await repo.addFoodLogItem(payload);
            toast(`Added ${payload.name} to log`, { type: 'success' });
          }
          sheet.close();
          this.refresh();
        });

        $('#btn-save-manual-staple', sheetApi.body)?.addEventListener('click', async () => {
          const payload = getPayload();
          await repo.addFoodLogItem(payload);
          await repo.saveStaple({
            name: payload.name,
            serving: payload.serving,
            calories: payload.calories,
            protein: payload.protein,
            sugar: payload.sugar,
            sodium: payload.sodium,
          });
          toast(`Logged & saved to staples!`, { type: 'success' });
          sheet.close();
          this.refresh();
        });
      },
    });
  }

  openItemOptionsSheet(item) {
    actionSheet({
      title: item.name,
      actions: [
        {
          label: 'Edit Entry',
          icon: 'edit',
          onClick: () => this.openManualEntrySheet(item),
        },
        {
          label: 'Save as Staple',
          icon: 'star',
          onClick: async () => {
            await repo.saveStaple({
              name: item.name,
              serving: item.serving,
              calories: item.calories,
              protein: item.protein,
              sugar: item.sugar,
              sodium: item.sodium,
            });
            toast(`Saved "${item.name}" to staples!`, { type: 'success' });
          },
        },
        {
          label: 'Delete Entry',
          icon: 'trash',
          danger: true,
          onClick: async () => {
            await repo.removeFoodLogItem(item.id);
            toast('Entry deleted');
            this.refresh();
          },
        },
      ],
    });
  }
}

export const nutritionView = new NutritionView();
