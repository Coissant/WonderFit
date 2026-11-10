/* ==========================================================================
   Module 4: Settings & UI Customization
   - Daily Nutrition Goals (Calories, Protein, Sugar, Sodium)
   - Default Rest Timer duration & Weight Unit preference (lbs vs kg)
   - Theme toggle (Dark vs OLED) & Accent Color picker
   - Gemini API Key local storage for AI photo estimator
   - Data Management: Export / Import JSON backup & reset
   - Custom exercises management
   ========================================================================== */

import { $, $$, num, esc, dateKey } from '../utils.js';
import { openSheet, actionSheet, confirmDialog, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { repo } from '../store/repository.js';
import { ACCENT_PRESETS, applyTheme } from '../theme.js';
import { DEFAULT_GEMINI_MODEL, normalizeModel, prettyModelName, geminiEndpoint } from '../data/gemini.js';
import { openDayExerciseEditor } from '../components/day-exercise-editor.js';

class SettingsView {
  container = null;
  settings = null;
  showApiKey = false;

  async init(container) {
    this.container = container;
    this.bindImportFileInput();
    await this.refresh();
  }

  async refresh() {
    this.settings = await repo.getSettings();
    this.render();
  }

  render() {
    const s = this.settings;
    const currentTheme = s.theme || 'dark';
    const currentAccent = s.accent || '#30D158';

    const accentPresetsHtml = ACCENT_PRESETS.map((p) => {
      const isSelected = p.hex.toLowerCase() === currentAccent.toLowerCase();
      return `
        <button class="color-swatch ${isSelected ? 'selected' : ''}" data-hex="${p.hex}" style="background-color: ${p.hex}" title="${p.name}" aria-label="${p.name}">
          ${isSelected ? icon('check', 14) : ''}
        </button>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Settings</h1>
      </div>

      <div class="view-content settings-content">
        <!-- 1. NUTRITION & WATER GOALS -->
        <div class="settings-group">
          <div class="settings-group-title">Daily Nutrition & Water Goals</div>
          <div class="settings-card card">
            <div class="settings-row">
              <span class="settings-label">Calories</span>
              <div class="settings-input-group">
                <input type="number" id="goal-cal" class="text-input settings-num-input" value="${s.caloriesGoal || 2400}" min="500" step="50">
                <span class="settings-unit">kcal</span>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">Protein</span>
              <div class="settings-input-group">
                <input type="number" id="goal-pro" class="text-input settings-num-input" value="${s.proteinGoal || 160}" min="10" step="5">
                <span class="settings-unit">g</span>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">Sugar Target (Max)</span>
              <div class="settings-input-group">
                <input type="number" id="goal-sug" class="text-input settings-num-input" value="${s.sugarGoal || 45}" min="0" step="5">
                <span class="settings-unit">g</span>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">Sodium Target (Max)</span>
              <div class="settings-input-group">
                <input type="number" id="goal-sod" class="text-input settings-num-input" value="${s.sodiumGoal || 2300}" min="100" step="50">
                <span class="settings-unit">mg</span>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">Water Intake</span>
              <div class="settings-input-group">
                <input type="number" id="goal-water" class="text-input settings-num-input" value="${s.waterGoal || 80}" min="0" step="5">
                <select id="goal-water-unit" class="text-input select-input settings-unit-select">
                  <option value="oz" ${(s.waterUnit || 'oz') === 'oz' ? 'selected' : ''}>oz</option>
                  <option value="ml" ${s.waterUnit === 'ml' ? 'selected' : ''}>ml</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. WORKOUT & TIMER PREFERENCES -->
        <div class="settings-group">
          <div class="settings-group-title">Workout & Rest Timer</div>
          <div class="settings-card card">
            <div class="settings-row">
              <span class="settings-label">Weight Unit</span>
              <div class="segment-control" id="unit-segment">
                <button class="segment-btn ${s.weightUnit === 'lbs' ? 'active' : ''}" data-val="lbs">lbs</button>
                <button class="segment-btn ${s.weightUnit === 'kg' ? 'active' : ''}" data-val="kg">kg</button>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">Default Rest Duration</span>
              <div class="settings-input-group">
                <select id="rest-duration-select" class="text-input select-input">
                  <option value="60" ${s.defaultRestSec === 60 ? 'selected' : ''}>60 seconds (1 min)</option>
                  <option value="90" ${s.defaultRestSec === 90 ? 'selected' : ''}>90 seconds (1.5 min)</option>
                  <option value="120" ${s.defaultRestSec === 120 ? 'selected' : ''}>120 seconds (2 min)</option>
                  <option value="180" ${s.defaultRestSec === 180 ? 'selected' : ''}>180 seconds (3 min)</option>
                  <option value="240" ${s.defaultRestSec === 240 ? 'selected' : ''}>240 seconds (4 min)</option>
                </select>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">Auto-start rest on set check</span>
              <label class="toggle-switch-label">
                <input type="checkbox" id="auto-rest-toggle" ${s.autoStartRest !== false ? 'checked' : ''}>
                <span></span>
              </label>
            </div>
          </div>
        </div>

        <!-- 3. THEME & ACCENT COLOR -->
        <div class="settings-group">
          <div class="settings-group-title">Appearance & Theme</div>
          <div class="settings-card card">
            <div class="settings-row">
              <span class="settings-label">Color Scheme</span>
              <div class="segment-control" id="theme-segment">
                <button class="segment-btn ${currentTheme === 'dark' ? 'active' : ''}" data-val="dark">Dark</button>
                <button class="segment-btn ${currentTheme === 'oled' ? 'active' : ''}" data-val="oled">OLED Black</button>
              </div>
            </div>
            <div class="settings-row-col">
              <span class="settings-label">Primary Accent Color</span>
              <div class="color-palette-row">
                ${accentPresetsHtml}
                <label class="custom-color-picker-label" title="Custom Hex">
                  <input type="color" id="custom-accent-picker" value="${currentAccent}">
                  <span class="color-swatch-custom">${icon('zap', 14)}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. GEMINI VISION API KEY -->
        <div class="settings-group">
          <div class="settings-group-title">AI Meal Estimator (${esc(prettyModelName(s.geminiModel))})</div>
          <div class="settings-card card">
            <p class="settings-hint">
              Used strictly for the "Snap Meal Photo" feature. Your key is stored ONLY locally on this device and never sent to any third-party server.
            </p>
            <div class="settings-field">
              <label class="settings-field-label" for="gemini-model-input">Model Name</label>
              <div class="api-key-row no-pad">
                <input type="text" id="gemini-model-input" class="text-input api-key-input" list="gemini-model-options"
                  placeholder="${DEFAULT_GEMINI_MODEL}" value="${esc(normalizeModel(s.geminiModel))}"
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                <button class="btn btn-secondary btn-sm" id="btn-reset-model" title="Reset to default model">Reset</button>
              </div>
              <datalist id="gemini-model-options">
                <option value="${DEFAULT_GEMINI_MODEL}"></option>
              </datalist>
              <p class="settings-field-hint">Any Gemini model ID that supports image input. Default: <code>${DEFAULT_GEMINI_MODEL}</code></p>
            </div>
            <div class="settings-field">
              <label class="settings-field-label" for="gemini-key-input">API Key</label>
            </div>
            <div class="api-key-row">
              <input type="${this.showApiKey ? 'text' : 'password'}" id="gemini-key-input" class="text-input api-key-input"
                placeholder="AIzaSy..." value="${esc(s.geminiApiKey || '')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
              <button class="icon-btn" id="btn-toggle-key-visibility" title="Show/Hide Key" aria-label="Toggle Key Visibility">
                ${icon(this.showApiKey ? 'eyeOff' : 'eye', 18)}
              </button>
            </div>
            <div class="api-key-actions">
              <button class="btn btn-secondary btn-sm" id="btn-test-gemini-key">Test Key</button>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" class="btn-text-accent btn-sm">Get Free API Key ↗</a>
            </div>
          </div>
        </div>

        <!-- 5. EXERCISE LIBRARY -->
        <div class="settings-group">
          <div class="settings-group-title">Exercise Library & Auto-Fill Templates</div>
          <div class="settings-card card">
            <button class="list-item settings-list-btn" id="btn-manage-split-autofills">
              <div>
                <div class="item-title">Configure Split Auto-fill Exercises</div>
                <div class="item-meta">Edit which exercises auto-fill for Leg Day, Push, Pull, etc.</div>
              </div>
              ${icon('chevronRight', 18)}
            </button>
            <button class="list-item settings-list-btn" id="btn-manage-custom-exercises">
              <div class="item-title">Manage Custom Exercises</div>
              ${icon('chevronRight', 18)}
            </button>
          </div>
        </div>

        <!-- 6. DATA MANAGEMENT: EXPORT / IMPORT -->
        <div class="settings-group">
          <div class="settings-group-title">Data Backup & Restore</div>
          <div class="settings-card card">
            <div class="data-actions-stack">
              <button class="btn btn-secondary btn-block" id="btn-export-json">
                ${icon('download', 18)} Export All Data (JSON)
              </button>
              <button class="btn btn-secondary btn-block" id="btn-trigger-import">
                ${icon('upload', 18)} Import Data (JSON)
              </button>
              <button class="btn btn-danger-outline btn-block mt-2" id="btn-reset-data">
                ${icon('trash', 18)} Reset to Default Sample Data
              </button>
            </div>
          </div>
        </div>

        <!-- 7. APP INFO -->
        <div class="settings-group">
          <div class="settings-card card app-info-card">
            <div class="app-info-title">FitTrack PWA</div>
            <div class="app-info-meta">Storage: <strong>${repo.backendName}</strong> · Mobile-First Offline Ready</div>
            <p class="app-info-ios">
              Tip for iPhone: Tap the <strong>Share</strong> button in Safari and select <strong>"Add to Home Screen"</strong> for full-screen native experience.
            </p>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // 1. Nutrition Goals save
    const saveGoals = async () => {
      const updates = {
        caloriesGoal: num($('#goal-cal', this.container)?.value, 2400),
        proteinGoal: num($('#goal-pro', this.container)?.value, 160),
        sugarGoal: num($('#goal-sug', this.container)?.value, 45),
        sodiumGoal: num($('#goal-sod', this.container)?.value, 2300),
        waterGoal: num($('#goal-water', this.container)?.value, 80),
        waterUnit: $('#goal-water-unit', this.container)?.value || 'oz',
      };
      this.settings = await repo.saveSettings(updates);
      toast('Goals updated', { type: 'success' });
    };

    ['#goal-cal', '#goal-pro', '#goal-sug', '#goal-sod', '#goal-water', '#goal-water-unit'].forEach((sel) => {
      $(sel, this.container)?.addEventListener('change', saveGoals);
    });

    // 2. Weight Unit
    $$('#unit-segment .segment-btn', this.container).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const unit = btn.dataset.val;
        $$('#unit-segment .segment-btn', this.container).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings = await repo.saveSettings({ weightUnit: unit });
        toast(`Weight unit set to ${unit}`);
      });
    });

    // 3. Rest timer duration
    $('#rest-duration-select', this.container)?.addEventListener('change', async (e) => {
      const sec = num(e.target.value, 90);
      this.settings = await repo.saveSettings({ defaultRestSec: sec });
      toast(`Default rest timer set to ${sec}s`);
    });

    // 4. Auto-rest toggle
    $('#auto-rest-toggle', this.container)?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      this.settings = await repo.saveSettings({ autoStartRest: enabled });
      toast(`Auto-rest timer ${enabled ? 'enabled' : 'disabled'}`);
    });

    // 5. Theme toggle
    $$('#theme-segment .segment-btn', this.container).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.val;
        $$('#theme-segment .segment-btn', this.container).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings = await repo.saveSettings({ theme });
        applyTheme({ theme, accent: this.settings.accent });
        toast(`Theme set to ${theme}`);
      });
    });

    // 6. Accent color swatches
    $$('.color-swatch', this.container).forEach((swatch) => {
      swatch.addEventListener('click', async () => {
        const hex = swatch.dataset.hex;
        this.settings = await repo.saveSettings({ accent: hex });
        applyTheme({ theme: this.settings.theme, accent: hex });
        this.render();
      });
    });

    // Custom color picker
    $('#custom-accent-picker', this.container)?.addEventListener('input', async (e) => {
      const hex = e.target.value;
      this.settings = await repo.saveSettings({ accent: hex });
      applyTheme({ theme: this.settings.theme, accent: hex });
    });

    // 7. Gemini model name + API Key
    const modelInput = $('#gemini-model-input', this.container);
    const saveModel = async (value) => {
      const model = normalizeModel(value);
      if (modelInput) modelInput.value = model;
      this.settings = await repo.saveSettings({ geminiModel: model });
      const title = modelInput?.closest('.settings-group')?.querySelector('.settings-group-title');
      if (title) title.textContent = `AI Meal Estimator (${prettyModelName(model)})`;
      toast(`Gemini model set to ${model}`);
    };
    modelInput?.addEventListener('change', () => saveModel(modelInput.value));
    $('#btn-reset-model', this.container)?.addEventListener('click', () => saveModel(DEFAULT_GEMINI_MODEL));

    const apiKeyInput = $('#gemini-key-input', this.container);
    apiKeyInput?.addEventListener('change', async () => {
      const key = apiKeyInput.value.trim();
      this.settings = await repo.saveSettings({ geminiApiKey: key });
      toast('API key saved locally');
    });

    $('#btn-toggle-key-visibility', this.container)?.addEventListener('click', () => {
      this.showApiKey = !this.showApiKey;
      this.render();
    });

    $('#btn-test-gemini-key', this.container)?.addEventListener('click', async () => {
      const key = $('#gemini-key-input', this.container)?.value?.trim();
      if (!key) {
        toast('Please enter a Gemini API key first', { type: 'warn' });
        return;
      }
      const model = normalizeModel($('#gemini-model-input', this.container)?.value);
      toast(`Testing key with ${model}...`);
      try {
        const testRes = await fetch(geminiEndpoint(model, key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply "ok"' }] }] }),
        });
        if (testRes.ok) {
          toast(`Key works with ${model} ✓`, { type: 'success' });
          this.settings = await repo.saveSettings({ geminiApiKey: key, geminiModel: model });
        } else {
          const errData = await testRes.json().catch(() => ({}));
          toast(`Key error: ${errData.error?.message || testRes.statusText}`, { type: 'danger', duration: 4000 });
        }
      } catch (err) {
        toast(`Network error: ${err.message}`, { type: 'danger' });
      }
    });

    // 8. Auto-fill Templates & Custom Exercises Manager
    $('#btn-manage-split-autofills', this.container)?.addEventListener('click', async () => {
      const split = await repo.getActiveSplit();
      if (!split || !split.days || split.days.length === 0) {
        toast('No active split found. Create one in Dashboard.', { type: 'warn' });
        return;
      }
      const actions = split.days.map((d, i) => ({
        label: `${d.name} (${d.rest ? 'Rest Day' : `${d.exerciseIds?.length || 0} exercises`})`,
        icon: d.rest ? 'moon' : 'dumbbell',
        onClick: () => {
          if (d.rest) {
            toast(`${d.name} is a rest day.`);
            return;
          }
          openDayExerciseEditor({
            title: `${d.name} Auto-fill Exercises`,
            dayName: d.name,
            exerciseIds: d.exerciseIds,
            onSave: async (ids) => {
              await repo.updateSplitDayExercises(split.id, d.id, ids);
              toast(`Updated auto-fill exercises for ${d.name}!`, { type: 'success' });
            },
          });
        },
      }));
      actionSheet({
        title: 'Select Routine to Configure Auto-fill',
        actions,
      });
    });

    $('#btn-manage-custom-exercises', this.container)?.addEventListener('click', () => {
      this.openCustomExercisesSheet();
    });

    // 9. Export JSON
    $('#btn-export-json', this.container)?.addEventListener('click', async () => {
      try {
        const backupData = await repo.exportAllData();
        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fittrack-backup-${dateKey()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Backup file downloaded! ✓', { type: 'success' });
      } catch (err) {
        toast(`Export failed: ${err.message}`, { type: 'danger' });
      }
    });

    // 10. Import JSON
    $('#btn-trigger-import', this.container)?.addEventListener('click', () => {
      const importInput = $('#import-input');
      if (importInput) {
        importInput.click();
      }
    });

    // 11. Reset data
    $('#btn-reset-data', this.container)?.addEventListener('click', async () => {
      const ok = await confirmDialog('This will reset all your logs, custom exercises, and history back to clean defaults. Are you sure?', {
        title: 'Reset All Data',
        okText: 'Reset Everything',
        danger: true,
      });
      if (ok) {
        await repo.resetToDefaults();
        toast('Data reset to defaults', { type: 'success' });
        location.reload();
      }
    });
  }

  bindImportFileInput() {
    const importInput = $('#import-input');
    if (!importInput) return;

    importInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      importInput.value = '';

      try {
        const text = await file.text();
        const json = JSON.parse(text);

        if (!json.app || !json.data) {
          throw new Error('Not a valid FitTrack backup file');
        }

        const proceed = await confirmDialog(`Importing will restore workouts, nutrition logs, and split routines from ${json.exportedAt || 'backup'}. Proceed?`, {
          title: 'Confirm Restore',
          okText: 'Import & Overwrite',
        });

        if (proceed) {
          await repo.importAllData(json);
          toast('Data imported successfully!', { type: 'success' });
          setTimeout(() => location.reload(), 800);
        }
      } catch (err) {
        toast(`Import failed: ${err.message}`, { type: 'danger', duration: 4000 });
      }
    });
  }

  async openCustomExercisesSheet() {
    const all = await repo.getExercises();
    const customList = all.filter((e) => e.isCustom);

    const renderList = () => {
      if (customList.length === 0) {
        return `<div class="empty-state-text">No custom exercises created yet.</div>`;
      }
      return customList.map((e) => `
        <div class="list-item custom-ex-item" data-id="${e.id}">
          <div>
            <div class="item-title">${esc(e.name)}</div>
            <div class="item-meta">${esc(e.category)}</div>
          </div>
          <button class="icon-btn btn-del-custom-ex" data-id="${e.id}" title="Delete">${icon('trash', 16)}</button>
        </div>
      `).join('');
    };

    const html = `
      <div class="custom-ex-mgmt-wrap">
        <div class="list custom-ex-list" id="custom-ex-list-box">
          ${renderList()}
        </div>
      </div>
    `;

    openSheet({
      title: 'Custom Exercises',
      html,
      onMount: (sheetApi) => {
        const bindDeletes = () => {
          $$('.btn-del-custom-ex', sheetApi.body).forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.dataset.id;
              const ex = customList.find((x) => x.id === id);
              const ok = await confirmDialog(`Delete custom exercise "${ex?.name}"?`, {
                title: 'Delete Exercise',
                okText: 'Delete',
                danger: true,
              });
              if (ok) {
                await repo.deleteExercise(id);
                const idx = customList.findIndex((x) => x.id === id);
                if (idx !== -1) customList.splice(idx, 1);
                $('#custom-ex-list-box', sheetApi.body).innerHTML = renderList();
                bindDeletes();
                toast('Exercise deleted');
              }
            });
          });
        };
        bindDeletes();
      },
    });
  }
}

export const settingsView = new SettingsView();
