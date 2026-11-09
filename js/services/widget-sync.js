/* ==========================================================================
   iOS Home Screen Widget (Scriptable) Integration & Cloud Sync Service
   - Gathers today's 4 Nutrition metrics (Calories, Protein, Sugar, Sodium)
     and today's scheduled workout split / completion status.
   - Pushes a tiny, lightweight JSON payload to Firebase Realtime Database
     (via standard HTTP PUT) or GitHub Gist (via REST PATCH).
   - Generates and copies ready-to-use JavaScript code for the iOS "Scriptable" app,
     styled to match FitTrack's dark/OLED UI and the user's accent color.
   ========================================================================== */

import { repo, planForDate } from '../store/repository.js';
import { dateKey } from '../utils.js';

let syncTimer = null;

/**
 * Normalizes a Firebase Realtime Database URL to ensure it points to a .json endpoint.
 * E.g.: "https://app-default-rtdb.firebaseio.com/widget" -> "https://app-default-rtdb.firebaseio.com/widget.json"
 */
export function normalizeFirebaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  if (!url) return '';

  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname || '/';
    if (!pathname.endsWith('.json')) {
      if (pathname.endsWith('/')) {
        pathname += 'fittrack-widget.json';
      } else {
        pathname += '.json';
      }
      parsed.pathname = pathname;
    }
    return parsed.toString();
  } catch (e) {
    // If not a full URL yet, append .json if missing
    if (!url.includes('.json')) {
      const qIdx = url.indexOf('?');
      if (qIdx === -1) {
        url = url.replace(/\/+$/, '') + '.json';
      } else {
        url = url.slice(0, qIdx).replace(/\/+$/, '') + '.json' + url.slice(qIdx);
      }
    }
    return url;
  }
}

/**
 * Compiles today's stats into a clean, tiny JSON payload matching widget requirements.
 */
export async function buildWidgetPayload() {
  const today = dateKey();

  const [settings, foodLogs, workouts, split, overrides] = await Promise.all([
    repo.getSettings(),
    repo.getFoodLog(today),
    repo.getWorkouts(),
    repo.getActiveSplit(),
    repo.getAllOverrides(),
  ]);

  // Today's 4 nutrition totals
  const calories = Math.round(foodLogs.reduce((sum, f) => sum + (Number(f.calories) || 0), 0));
  const protein = Math.round(foodLogs.reduce((sum, f) => sum + (Number(f.protein) || 0), 0));
  const sugar = Math.round(foodLogs.reduce((sum, f) => sum + (Number(f.sugar) || 0), 0));
  const sodium = Math.round(foodLogs.reduce((sum, f) => sum + (Number(f.sodium) || 0), 0));

  // Today's workout completion
  const todayWorkouts = workouts.filter((w) => w.date === today);
  const workoutCompleted = todayWorkouts.length > 0;
  const workoutTitle = workoutCompleted ? (todayWorkouts[0].title || 'Workout') : null;

  // Today's scheduled split
  const plan = planForDate(split, overrides, today);
  let todaySplit = 'Rest Day';
  if (plan && plan.day) {
    todaySplit = plan.day.rest ? 'Rest Day' : plan.day.name;
  } else if (!split) {
    todaySplit = 'No Split Configured';
  }

  return {
    calories,
    caloriesGoal: settings.caloriesGoal || 2400,
    protein,
    proteinGoal: settings.proteinGoal || 160,
    sugar,
    sugarGoal: settings.sugarGoal || 45,
    sodium,
    sodiumGoal: settings.sodiumGoal || 2300,
    todaySplit,
    workoutCompleted,
    workoutTitle,
    accentColor: settings.accent || '#30D158',
    theme: settings.theme || 'dark',
    date: today,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Sends the payload to the configured cloud provider (Firebase or GitHub Gist).
 */
export async function pushToCloud(payload, settings) {
  const s = settings || (await repo.getSettings());
  const provider = s.widgetSyncProvider || 'firebase';

  if (provider === 'gist') {
    const token = (s.widgetGistToken || '').trim();
    const gistId = (s.widgetGistId || '').trim();
    if (!token) throw new Error('GitHub Personal Access Token is required for Gist sync');
    if (!gistId) throw new Error('GitHub Gist ID is required');

    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'FitTrack iOS Widget Data',
        files: {
          'fittrack-widget.json': {
            content: JSON.stringify(payload, null, 2),
          },
        },
      }),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err.message) msg = err.message;
      } catch (_) {}
      throw new Error(`GitHub Gist update failed: ${msg}`);
    }

    return { provider: 'gist', destination: `Gist (${gistId.slice(0, 7)}…)` };
  }

  // Default: Firebase Realtime Database (PUT)
  const url = normalizeFirebaseUrl(s.widgetFirebaseUrl);
  if (!url) {
    throw new Error('Firebase Database URL is required (e.g. https://<db>.firebaseio.com/widget.json)');
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errText = await res.text();
      if (errText) msg = errText;
    } catch (_) {}
    throw new Error(`Firebase PUT failed: ${msg}`);
  }

  return { provider: 'firebase', destination: url };
}

/**
 * Triggers a widget sync. If called in the background, debounces and suppresses errors.
 * If called with manual: true, runs immediately and throws on failure.
 */
export async function triggerWidgetSync({ manual = false, force = false } = {}) {
  const settings = await repo.getSettings();

  // If sync is not enabled and not manual, do nothing
  if (!settings.widgetSyncEnabled && !manual && !force) {
    return null;
  }

  if (manual) {
    const payload = await buildWidgetPayload();
    return await pushToCloud(payload, settings);
  }

  // Debounced background sync
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const payload = await buildWidgetPayload();
      await pushToCloud(payload, settings);
    } catch (e) {
      // Background sync errors are logged quietly without interrupting the user
      console.warn('Background widget sync skipped or failed:', e.message);
    }
  }, 350);
}

/**
 * Generates the full JavaScript code for the iOS Scriptable app.
 */
export function generateScriptableCode(settings = {}) {
  const provider = settings.widgetSyncProvider || 'firebase';
  const firebaseNormUrl = normalizeFirebaseUrl(settings.widgetFirebaseUrl || '');
  const gistId = (settings.widgetGistId || '').trim();
  const gistToken = (settings.widgetGistToken || '').trim();
  const accent = settings.accent || '#30D158';
  const isOled = settings.theme === 'oled';

  // Determine current web app origin to open when tapping widget
  let appUrl = 'https://boreal777.github.io/FitTrack/';
  try {
    if (typeof window !== 'undefined' && window.location) {
      appUrl = window.location.href.split('#')[0].split('?')[0];
    }
  } catch (_) {}

  return `// ============================================================================
// FitTrack — iOS Home Screen Widget for Scriptable
// Displays Today's Nutrition (Calories, Protein, Sugar, Sodium) & Workout Split
// Compatible with Small, Medium, and Large widgets!
// ============================================================================

// 1. CONFIGURATION
const SYNC_PROVIDER = ${JSON.stringify(provider)}; // "firebase" or "gist"
const FIREBASE_URL = ${JSON.stringify(firebaseNormUrl || 'https://YOUR-APP-default-rtdb.firebaseio.com/fittrack-widget.json')};
const GIST_ID = ${JSON.stringify(gistId || 'YOUR_GIST_ID')};
const GIST_TOKEN = ${JSON.stringify(gistToken || '')}; // Optional for public gists

const ACCENT_COLOR = ${JSON.stringify(accent)};
const IS_OLED = ${isOled ? 'true' : 'false'};
const APP_URL = ${JSON.stringify(appUrl)};

// 2. FETCH DATA WITH OFFLINE CACHE FALLBACK
async function loadWidgetData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), "fittrack-widget-cache.json");

  try {
    let req;
    if (SYNC_PROVIDER === "gist") {
      req = new Request("https://api.github.com/gists/" + GIST_ID);
      req.headers = { "Accept": "application/vnd.github+json" };
      if (GIST_TOKEN) req.headers["Authorization"] = "Bearer " + GIST_TOKEN;
    } else {
      req = new Request(FIREBASE_URL);
    }

    req.timeoutInterval = 8;
    const res = await req.loadJSON();

    let data;
    if (SYNC_PROVIDER === "gist") {
      const file = res.files && res.files["fittrack-widget.json"];
      if (!file) throw new Error("fittrack-widget.json not found in Gist");
      data = JSON.parse(file.content);
    } else {
      data = res;
    }

    if (data && typeof data === "object") {
      fm.writeString(cachePath, JSON.stringify(data));
      return data;
    }
    throw new Error("Invalid payload received");
  } catch (err) {
    if (fm.fileExists(cachePath)) {
      try {
        return JSON.parse(fm.readString(cachePath));
      } catch (_) {}
    }
    // Fallback placeholder data if first run and offline
    return {
      calories: 0,
      caloriesGoal: 2400,
      protein: 0,
      proteinGoal: 160,
      sugar: 0,
      sugarGoal: 45,
      sodium: 0,
      sodiumGoal: 2300,
      todaySplit: "No Data",
      workoutCompleted: false,
      workoutTitle: null,
      accentColor: ACCENT_COLOR,
      updatedAt: null,
    };
  }
}

// 3. DRAW PROGRESS BAR HELPER (Using Scriptable DrawContext)
function drawProgressBar(current, goal, colorHex, width = 110, height = 6) {
  const safeGoal = Math.max(goal || 1, 1);
  const ratio = Math.min(Math.max((current || 0) / safeGoal, 0), 1);

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;

  // Background track
  ctx.setFillColor(new Color("#FFFFFF", 0.12));
  const trackPath = new Path();
  trackPath.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  ctx.addPath(trackPath);
  ctx.fillPath();

  // Progress fill
  if (ratio > 0) {
    const fillWidth = Math.max(height, Math.round(width * ratio));
    ctx.setFillColor(new Color(colorHex));
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, 0, fillWidth, height), height / 2, height / 2);
    ctx.addPath(fillPath);
    ctx.fillPath();
  }

  return ctx.getImage();
}

// 4. BUILD WIDGET
async function createWidget() {
  const data = await loadWidgetData();
  const accent = data.accentColor || ACCENT_COLOR;

  const widget = new ListWidget();
  widget.backgroundColor = IS_OLED ? new Color("#000000") : new Color("#0E0E11");
  widget.setPadding(12, 14, 12, 14);
  if (APP_URL) widget.url = APP_URL;

  const widgetSize = config.widgetFamily || "medium";

  if (widgetSize === "small") {
    // ---- SMALL WIDGET (2x2) ----
    const header = widget.addStack();
    header.layoutHorizontally();
    const tag = header.addText("FITTRACK");
    tag.font = Font.boldSystemFont(10);
    tag.textColor = new Color(accent);
    header.addSpacer();

    const dot = header.addText(data.workoutCompleted ? "✓ DONE" : "SPLIT");
    dot.font = Font.boldSystemFont(9);
    dot.textColor = data.workoutCompleted ? new Color(accent) : new Color("#8E8E93");

    widget.addSpacer(4);

    const splitText = widget.addText(data.todaySplit || "Rest Day");
    splitText.font = Font.boldSystemFont(13);
    splitText.textColor = new Color("#FFFFFF");
    splitText.lineLimit = 1;

    widget.addSpacer(6);

    // Calorie big stat
    const calLabel = widget.addText(\`\${(data.calories || 0).toLocaleString()} kcal\`);
    calLabel.font = Font.boldSystemFont(16);
    calLabel.textColor = new Color("#FF9F0A");

    widget.addSpacer(2);
    widget.addImage(drawProgressBar(data.calories, data.caloriesGoal, "#FF9F0A", 125, 5));

    widget.addSpacer(6);

    // Protein stat
    const proLabel = widget.addText(\`Protein: \${data.protein || 0}g / \${data.proteinGoal || 160}g\`);
    proLabel.font = Font.mediumSystemFont(11);
    proLabel.textColor = new Color(accent);

    widget.addSpacer(2);
    widget.addImage(drawProgressBar(data.protein, data.proteinGoal, accent, 125, 5));

    return widget;
  }

  // ---- MEDIUM WIDGET (4x2) & LARGE (Default / Most Popular) ----
  const mainStack = widget.addStack();
  mainStack.layoutHorizontally();

  // LEFT COLUMN: Workout & Date
  const leftCol = mainStack.addStack();
  leftCol.layoutVertically();
  leftCol.size = new Size(130, 0);

  const appTitle = leftCol.addText("FITTRACK");
  appTitle.font = Font.boldSystemFont(11);
  appTitle.textColor = new Color(accent);

  leftCol.addSpacer(2);

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const dateText = leftCol.addText(dateStr);
  dateText.font = Font.systemFont(11);
  dateText.textColor = new Color("#8E8E93");

  leftCol.addSpacer(10);

  // Split badge
  const splitBadge = leftCol.addText(data.workoutCompleted ? "COMPLETED ✓" : "TODAY'S SPLIT");
  splitBadge.font = Font.boldSystemFont(9);
  splitBadge.textColor = data.workoutCompleted ? new Color(accent) : new Color("#98989D");

  leftCol.addSpacer(2);

  const splitTitle = leftCol.addText(data.workoutTitle || data.todaySplit || "Rest Day");
  splitTitle.font = Font.boldSystemFont(15);
  splitTitle.textColor = new Color("#FFFFFF");
  splitTitle.lineLimit = 2;

  leftCol.addSpacer();

  // Last update time
  let timeStr = "Live";
  if (data.updatedAt) {
    try {
      timeStr = new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch (_) {}
  }
  const syncLabel = leftCol.addText(\`Updated \${timeStr}\`);
  syncLabel.font = Font.systemFont(9);
  syncLabel.textColor = new Color("#636366");

  mainStack.addSpacer(12);

  // RIGHT COLUMN: 4 Nutrition Metrics Progress Rows
  const rightCol = mainStack.addStack();
  rightCol.layoutVertically();

  const metrics = [
    { name: "Calories", val: data.calories, goal: data.caloriesGoal, unit: "kcal", color: "#FF9F0A" },
    { name: "Protein", val: data.protein, goal: data.proteinGoal, unit: "g", color: accent },
    { name: "Sugar", val: data.sugar, goal: data.sugarGoal, unit: "g", color: "#FF375F" },
    { name: "Sodium", val: data.sodium, goal: data.sodiumGoal, unit: "mg", color: "#40C8E0" },
  ];

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const row = rightCol.addStack();
    row.layoutHorizontally();

    const nameText = row.addText(m.name);
    nameText.font = Font.mediumSystemFont(11);
    nameText.textColor = new Color("#D1D1D6");

    row.addSpacer();

    const valText = row.addText(\`\${(m.val || 0).toLocaleString()} / \${(m.goal || 0).toLocaleString()} \${m.unit}\`);
    valText.font = Font.boldSystemFont(11);
    valText.textColor = new Color(m.color);

    rightCol.addSpacer(2);
    rightCol.addImage(drawProgressBar(m.val, m.goal, m.color, 160, 5));

    if (i < metrics.length - 1) rightCol.addSpacer(5);
  }

  return widget;
}

// 5. RUN OR PREVIEW
const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();
`;
}
