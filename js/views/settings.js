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
import { generateScriptableCode, triggerWidgetSync, normalizeFirebaseUrl } from '../services/widget-sync.js';

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

class SettingsView {
  container = null;
  settings = null;
  showApiKey = false;
  showGistToken = false;

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
        <!-- 1. NUTRITION GOALS (4 METRICS ONLY) -->
        <div class="settings-group">
          <div class="settings-group-title">Daily Nutrition Goals (4 Metrics Only)</div>
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

        <!-- 6. IOS HOME SCREEN WIDGET (SCRIPTABLE) -->
        <div class="settings-group">
          <div class="settings-group-title">iOS Home Screen Widget (Scriptable)</div>
          <div class="settings-card card">
            <p class="settings-hint">
              Display today's 4 Nutrition metrics (Calories, Protein, Sugar, Sodium) and scheduled Workout Split live on your iPhone Home Screen using the free <strong>Scriptable</strong> iOS app.
            </p>

            <div class="settings-row">
              <span class="settings-label">Auto-Sync Widget Cloud Data</span>
              <label class="toggle-switch-label">
                <input type="checkbox" id="widget-sync-toggle" ${s.widgetSyncEnabled ? 'checked' : ''}>
                <span></span>
              </label>
            </div>

            <div class="settings-field">
              <label class="settings-field-label" for="widget-provider-select">Sync Provider</label>
              <select id="widget-provider-select" class="text-input select-input">
                <option value="firebase" ${s.widgetSyncProvider !== 'gist' ? 'selected' : ''}>Firebase Realtime Database (Free & Instant PUT)</option>
                <option value="gist" ${s.widgetSyncProvider === 'gist' ? 'selected' : ''}>GitHub Gist (Personal Token + Gist ID)</option>
              </select>
            </div>

            <div id="widget-firebase-fields" class="${s.widgetSyncProvider === 'gist' ? 'hidden' : ''}">
              <div class="settings-field">
                <label class="settings-field-label" for="widget-firebase-url">Firebase Database URL</label>
                <input type="url" id="widget-firebase-url" class="text-input api-key-input"
                  placeholder="https://<YOUR-PROJECT>-default-rtdb.firebaseio.com/fittrack-widget.json"
                  value="${esc(s.widgetFirebaseUrl || '')}"
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                <p class="settings-field-hint">
                  Your free Firebase RTDB endpoint. Every time you log food, finish a workout, or update your split, a tiny JSON payload is HTTP PUT directly here.
                </p>
              </div>
            </div>

            <div id="widget-gist-fields" class="${s.widgetSyncProvider !== 'gist' ? 'hidden' : ''}">
              <div class="settings-field">
                <label class="settings-field-label" for="widget-gist-token">GitHub Token (Gist Scope)</label>
                <div class="api-key-row no-pad">
                  <input type="${this.showGistToken ? 'text' : 'password'}" id="widget-gist-token" class="text-input api-key-input"
                    placeholder="ghp_..." value="${esc(s.widgetGistToken || '')}"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                  <button class="icon-btn" id="btn-toggle-gist-token" title="Show/Hide Token" aria-label="Toggle Gist Token Visibility">
                    ${icon(this.showGistToken ? 'eyeOff' : 'eye', 18)}
                  </button>
                </div>
              </div>
              <div class="settings-field">
                <label class="settings-field-label" for="widget-gist-id">Gist ID</label>
                <input type="text" id="widget-gist-id" class="text-input api-key-input"
                  placeholder="e.g. 7f8a9b2c3d4e5f6a..." value="${esc(s.widgetGistId || '')}"
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                <p class="settings-field-hint">
                  Updates <code>fittrack-widget.json</code> inside this Gist whenever data changes.
                </p>
              </div>
            </div>

            <div class="widget-actions-stack">
              <button class="btn btn-primary btn-block" id="btn-copy-widget-code">
                ${icon('layers', 18)} Copy Scriptable Widget Code
              </button>
              <div class="btn-row">
                <button class="btn btn-secondary flex-1" id="btn-test-widget-sync">
                  ${icon('repeat', 16)} Test Sync Now
                </button>
                <button class="btn btn-secondary flex-1" id="btn-widget-setup-guide">
                  ${icon('info', 16)} Setup Guide
                </button>
              </div>
            </div>
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
      };
      this.settings = await repo.saveSettings(updates);
      toast('Goals updated', { type: 'success' });
      triggerWidgetSync();
    };

    ['#goal-cal', '#goal-pro', '#goal-sug', '#goal-sod'].forEach((sel) => {
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

    // 9. iOS Home Screen Widget (Scriptable) Cloud Sync Handlers
    const saveWidgetInputs = async () => {
      const provider = $('#widget-provider-select', this.container)?.value || 'firebase';
      const firebaseUrl = $('#widget-firebase-url', this.container)?.value?.trim() || '';
      const gistToken = $('#widget-gist-token', this.container)?.value?.trim() || '';
      const gistId = $('#widget-gist-id', this.container)?.value?.trim() || '';
      const enabled = $('#widget-sync-toggle', this.container)?.checked || false;

      this.settings = await repo.saveSettings({
        widgetSyncEnabled: enabled,
        widgetSyncProvider: provider,
        widgetFirebaseUrl: firebaseUrl,
        widgetGistToken: gistToken,
        widgetGistId: gistId,
      });
      return this.settings;
    };

    $('#widget-sync-toggle', this.container)?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await saveWidgetInputs();
      toast(`Widget cloud sync ${enabled ? 'enabled' : 'disabled'}`);
      if (enabled) {
        triggerWidgetSync();
      }
    });

    $('#widget-provider-select', this.container)?.addEventListener('change', async (e) => {
      const val = e.target.value;
      const fbBox = $('#widget-firebase-fields', this.container);
      const gistBox = $('#widget-gist-fields', this.container);
      if (fbBox && gistBox) {
        fbBox.classList.toggle('hidden', val !== 'firebase');
        gistBox.classList.toggle('hidden', val !== 'gist');
      }
      await saveWidgetInputs();
    });

    ['#widget-firebase-url', '#widget-gist-token', '#widget-gist-id'].forEach((sel) => {
      $(sel, this.container)?.addEventListener('change', async () => {
        await saveWidgetInputs();
        toast('Widget sync settings saved');
        if (this.settings.widgetSyncEnabled) {
          triggerWidgetSync();
        }
      });
    });

    $('#btn-toggle-gist-token', this.container)?.addEventListener('click', () => {
      this.showGistToken = !this.showGistToken;
      const input = $('#widget-gist-token', this.container);
      if (input) input.type = this.showGistToken ? 'text' : 'password';
      const btn = $('#btn-toggle-gist-token', this.container);
      if (btn) btn.innerHTML = icon(this.showGistToken ? 'eyeOff' : 'eye', 18);
    });

    $('#btn-copy-widget-code', this.container)?.addEventListener('click', async () => {
      await saveWidgetInputs();
      const code = generateScriptableCode(this.settings);
      const copied = await copyToClipboard(code);
      if (copied) {
        haptic(25);
        toast('Scriptable widget code copied! ✓', { type: 'success' });
      }
      this.openWidgetCodeModal(code, copied);
    });

    $('#btn-test-widget-sync', this.container)?.addEventListener('click', async () => {
      await saveWidgetInputs();
      toast('Testing widget cloud sync...');
      try {
        const res = await triggerWidgetSync({ manual: true });
        haptic([30, 60]);
        toast(`Synced to ${res.destination} ✓`, { type: 'success', duration: 3500 });
      } catch (err) {
        toast(`Sync error: ${err.message}`, { type: 'danger', duration: 4500 });
      }
    });

    $('#btn-widget-setup-guide', this.container)?.addEventListener('click', () => {
      this.openWidgetSetupGuideModal();
    });

    // 10. Export JSON
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

  openWidgetCodeModal(code, alreadyCopied) {
    const html = `
      <div class="widget-modal-wrap">
        <p class="settings-field-hint mb-2">
          ${alreadyCopied ? '✓ <strong>Code has been copied to your clipboard!</strong>' : 'Select all code below to copy:'}
        </p>
        <textarea id="scriptable-code-box" class="widget-code-textarea" readonly spellcheck="false" autocorrect="off" autocapitalize="off">${esc(code)}</textarea>

        <div class="step-guide-list mt-3">
          <div class="step-guide-item">
            <span class="step-guide-num">1</span>
            <div class="step-guide-text">
              <strong>Open Scriptable on your iPhone</strong>
              <p>Install free from the iOS App Store if needed, and open it.</p>
            </div>
          </div>
          <div class="step-guide-item">
            <span class="step-guide-num">2</span>
            <div class="step-guide-text">
              <strong>Create a New Script</strong>
              <p>Tap <strong>+</strong>, name it <strong>FitTrack</strong>, paste this code, and tap Done.</p>
            </div>
          </div>
          <div class="step-guide-item">
            <span class="step-guide-num">3</span>
            <div class="step-guide-text">
              <strong>Add Widget to Home Screen</strong>
              <p>Long-press your iPhone Home Screen, tap <strong>+</strong> in top-left, pick <strong>Scriptable</strong> (Medium or Small), and choose <strong>FitTrack</strong>!</p>
            </div>
          </div>
        </div>
      </div>
    `;

    openSheet({
      title: 'iOS Scriptable Widget Code',
      html,
      footer: `
        <button class="btn btn-primary btn-block" id="btn-copy-modal-code">
          ${icon('layers', 16)} Copy Code Again
        </button>
      `,
      onMount: (sheetApi) => {
        const ta = $('#scriptable-code-box', sheetApi.body);
        ta?.addEventListener('focus', () => ta.select());
        $('#btn-copy-modal-code', sheetApi.footer)?.addEventListener('click', async () => {
          const ok = await copyToClipboard(code);
          haptic(20);
          toast(ok ? 'Scriptable code copied!' : 'Could not copy — please select and copy text above.');
        });
      },
    });
  }

  openWidgetSetupGuideModal() {
    const html = `
      <div class="step-guide-list">
        <div class="step-guide-item">
          <span class="step-guide-num">1</span>
          <div class="step-guide-text">
            <strong>Choose Your Sync Endpoint</strong>
            <p><strong>Option A (Recommended & 100% Free): Firebase Realtime Database</strong><br>
            • Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener" class="btn-text-accent">console.firebase.google.com ↗</a> and create a free project.<br>
            • Click <strong>Build > Realtime Database > Create Database</strong>.<br>
            • Under <strong>Rules</strong>, set read & write to true: <code>{ "rules": { ".read": true, ".write": true } }</code>.<br>
            • Copy your database URL (e.g. <code>https://your-project-default-rtdb.firebaseio.com/fittrack-widget.json</code>) and paste it into Settings.<br><br>
            <strong>Option B: GitHub Gist</strong><br>
            • Generate a GitHub personal access token with <code>gist</code> permission.<br>
            • Create a Gist, copy its ID, and paste into Settings.</p>
          </div>
        </div>
        <div class="step-guide-item">
          <span class="step-guide-num">2</span>
          <div class="step-guide-text">
            <strong>Turn on "Auto-Sync Widget Cloud Data"</strong>
            <p>FitTrack will now automatically push today's Calories, Protein, Sugar, Sodium, and scheduled Workout Split every time you log food, complete a session, or change your split.</p>
          </div>
        </div>
        <div class="step-guide-item">
          <span class="step-guide-num">3</span>
          <div class="step-guide-text">
            <strong>Install Scriptable on your iPhone</strong>
            <p>Download the free <strong>Scriptable</strong> app from the iOS App Store. Tap <strong>Copy Scriptable Widget Code</strong> in FitTrack, paste it into a new script named <strong>FitTrack</strong>, and add the widget to your Home Screen!</p>
          </div>
        </div>
      </div>
    `;

    openSheet({
      title: 'iOS Widget Setup Guide',
      html,
    });
  }
}

export const settingsView = new SettingsView();
