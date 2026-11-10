/* ==========================================================================
   Data Repository — High-level storage layer with fallback & swappable adapters.
   All modules access data through `repo`, never touching IndexedDB/Firestore
   directly.
   ========================================================================== */

import { STORAGE_BACKEND, FIREBASE_CONFIG } from './config.js';
import { BACKUP_COLLECTIONS } from './schema.js';
import { IndexedDBAdapter } from './indexeddb-adapter.js';
import { LocalStorageAdapter } from './localstorage-adapter.js';
import { DEFAULT_EXERCISES } from '../data/exercises.js';
import { SPLIT_TEMPLATES, splitFromTemplate } from '../data/split-templates.js';
import { DEFAULT_GEMINI_MODEL } from '../data/gemini.js';
import { uid, dateKey, clone, num, parseDateKey, daysBetween } from '../utils.js';

/**
 * Resolve which split day is planned for a date.
 * Pure function so the calendar can call it for every cell without extra DB reads.
 * Returns { split, day, override } or null.
 */
export function planForDate(split, overrides, dateStr) {
  if (!split || !Array.isArray(split.days) || split.days.length === 0) return null;

  const ov = (overrides || []).find((o) => o.date === dateStr || o.id === dateStr);
  if (ov) {
    // New format references a split day by id; legacy format stored a copy of the day.
    const dayId = ov.dayId || (ov.name ? ov.id : null);
    const day = split.days.find((d) => d.id === dayId);
    if (day) return { split, day, override: true };
    if (ov.name) return { split, day: ov, override: true };
  }

  const target = parseDateKey(dateStr);
  let index;
  if (split.type === 'weekly') {
    index = (target.getDay() + 6) % 7; // Mon=0 … Sun=6
  } else {
    const start = split.startDate ? parseDateKey(split.startDate) : target;
    const n = split.days.length;
    index = ((daysBetween(start, target) % n) + n) % n;
  }
  const day = split.days[index];
  return day ? { split, day, override: false } : null;
}

export const DEFAULT_SETTINGS = {
  id: 'user',
  // Nutrition daily goals (4 metrics + water)
  caloriesGoal: 2400,
  proteinGoal: 160,
  sugarGoal: 45,
  sodiumGoal: 2300,
  waterGoal: 80,
  waterUnit: 'oz',        // 'oz' | 'ml'
  // Workout preferences
  weightUnit: 'lbs',      // 'lbs' | 'kg'
  defaultRestSec: 90,     // seconds (e.g. 60, 90, 120, 180)
  autoStartRest: true,
  // UI & Theme
  theme: 'dark',          // 'dark' | 'oled'
  accent: '#30D158',      // iOS green default
  // AI Estimator
  geminiApiKey: '',
  geminiModel: DEFAULT_GEMINI_MODEL, // user-editable in Settings
  // System metadata
  updatedAt: Date.now(),
};

class Repository {
  adapter = null;
  backendName = '';
  ready = false;

  async init() {
    if (this.ready) return;

    if (STORAGE_BACKEND === 'firestore' && FIREBASE_CONFIG) {
      try {
        const { FirestoreAdapter } = await import('./firestore-adapter.js');
        this.adapter = new FirestoreAdapter(FIREBASE_CONFIG);
        await this.adapter.init();
        this.backendName = 'Firestore';
      } catch (err) {
        console.warn('[repo] Firestore init failed, falling back to IndexedDB:', err);
      }
    }

    if (!this.adapter) {
      try {
        const idb = new IndexedDBAdapter();
        await idb.init();
        this.adapter = idb;
        this.backendName = 'IndexedDB';
      } catch (err) {
        console.warn('[repo] IndexedDB unavailable, falling back to localStorage:', err);
        const ls = new LocalStorageAdapter();
        await ls.init();
        this.adapter = ls;
        this.backendName = 'localStorage';
      }
    }

    await this._seedDefaultsIfEmpty();
    this.ready = true;
    console.info(`[repo] Initialized storage backend: ${this.backendName}`);
  }

  async _seedDefaultsIfEmpty() {
    // 1. Settings
    const settings = await this.adapter.get('settings', 'user');
    if (!settings) {
      await this.adapter.put('settings', clone(DEFAULT_SETTINGS));
    }

    // 2. Exercises library
    const exercises = await this.adapter.getAll('exercises');
    if (!exercises || exercises.length === 0) {
      const seeded = DEFAULT_EXERCISES.map((e) => ({
        ...e,
        isCustom: false,
        createdAt: Date.now(),
      }));
      await this.adapter.bulkPut('exercises', seeded);
    }

    // 3. Splits
    const splits = await this.adapter.getAll('splits');
    if (!splits || splits.length === 0) {
      const defaultSplit = splitFromTemplate(SPLIT_TEMPLATES[0]); // PPL Rotation default
      defaultSplit.isActive = true;
      await this.adapter.put('splits', defaultSplit);
    }

    // 4. Staples sample foods for immediate 1-tap testing
    const staples = await this.adapter.getAll('staples');
    if (!staples || staples.length === 0) {
      const sampleStaples = [
        { id: uid(), name: 'Whey Protein Shake', serving: '1 scoop (35g)', calories: 130, protein: 25, sugar: 2, sodium: 160 },
        { id: uid(), name: 'Grilled Chicken Breast', serving: '200g', calories: 330, protein: 62, sugar: 0, sodium: 150 },
        { id: uid(), name: 'Greek Yogurt (0% fat)', serving: '1 cup (225g)', calories: 130, protein: 22, sugar: 7, sodium: 85 },
        { id: uid(), name: 'White Rice (Cooked)', serving: '1 cup (186g)', calories: 242, protein: 4.4, sugar: 0.1, sodium: 0 },
        { id: uid(), name: 'Whole Eggs (3 large)', serving: '3 eggs', calories: 215, protein: 18, sugar: 0.6, sodium: 210 },
      ];
      await this.adapter.bulkPut('staples', sampleStaples);
    }
  }

  /* ========================================================================
     SETTINGS
     ======================================================================== */
  async getSettings() {
    const s = await this.adapter.get('settings', 'user');
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
  }

  async saveSettings(updates) {
    const current = await this.getSettings();
    const updated = { ...current, ...updates, updatedAt: Date.now() };
    await this.adapter.put('settings', updated);
    return updated;
  }

  /* ========================================================================
     EXERCISES
     ======================================================================== */
  async getExercises() {
    const list = await this.adapter.getAll('exercises');
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getExercise(id) {
    return this.adapter.get('exercises', id);
  }

  async addExercise({ name, category, isCustom = true }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Exercise name cannot be empty');
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `-${Date.now().toString(36).slice(-4)}`;
    const doc = {
      id,
      name: trimmed,
      category: category || 'Compound',
      isCustom,
      createdAt: Date.now(),
    };
    await this.adapter.put('exercises', doc);
    return doc;
  }

  async deleteExercise(id) {
    await this.adapter.remove('exercises', id);
  }

  /* ========================================================================
     WORKOUT HISTORY & MEMORY QUERY
     ======================================================================== */
  async getWorkouts() {
    const list = await this.adapter.getAll('workouts');
    return list.sort((a, b) => (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt));
  }

  async getWorkout(id) {
    return this.adapter.get('workouts', id);
  }

  async getWorkoutsByDate(dateStr) {
    const list = await this.adapter.getByIndex('workouts', 'date', dateStr);
    return list || [];
  }

  async saveWorkout(workout) {
    if (!workout.id) workout.id = uid();
    if (!workout.date) workout.date = dateKey();
    await this.adapter.put('workouts', workout);
    return workout;
  }

  async deleteWorkout(id) {
    await this.adapter.remove('workouts', id);
  }

  /**
   * CRITICAL FEATURE:
   * Query the user's workout history and find the exact weight and reps lifted
   * the LAST time they performed that exercise.
   * Returns: { weight, reps, unit, setIndex, date, workoutTitle } or null.
   */
  async getLastPerformanceForExercise(exerciseId) {
    const workouts = await this.getWorkouts();
    for (const w of workouts) {
      if (!w.exercises) continue;
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId || e.id === exerciseId || e.name?.toLowerCase() === exerciseId?.toLowerCase());
      if (ex && ex.sets && ex.sets.length > 0) {
        // Find completed sets, or fallback to first valid set
        const completedSets = ex.sets.filter((s) => s.completed !== false && (num(s.weight) > 0 || num(s.reps) > 0));
        if (completedSets.length > 0) {
          // Last completed set or top set
          const lastSet = completedSets[completedSets.length - 1];
          return {
            weight: num(lastSet.weight),
            reps: num(lastSet.reps),
            unit: lastSet.unit || w.unit || 'lbs',
            date: w.date,
            workoutTitle: w.title,
            allSets: completedSets.map((s) => ({ weight: num(s.weight), reps: num(s.reps), unit: s.unit || w.unit || 'lbs' })),
          };
        }
      }
    }
    return null;
  }

  /* ========================================================================
     ACTIVE WORKOUT (Device-local state in 'meta' so refreshed tab survives)
     ======================================================================== */
  async getActiveWorkout() {
    return this.adapter.get('meta', 'active-workout');
  }

  async saveActiveWorkout(workout) {
    if (!workout) {
      await this.adapter.remove('meta', 'active-workout');
    } else {
      await this.adapter.put('meta', { id: 'active-workout', ...workout, savedAt: Date.now() });
    }
  }

  async clearActiveWorkout() {
    await this.adapter.remove('meta', 'active-workout');
  }

  /* ========================================================================
     NUTRITION / FOOD LOG (4 Metrics ONLY)
     ======================================================================== */
  async getFoodLog(dateStr = dateKey()) {
    const list = await this.adapter.getByIndex('foodLog', 'date', dateStr);
    return (list || []).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  async getAllFoodLogs() {
    return this.adapter.getAll('foodLog');
  }

  async addFoodLogItem(item) {
    const doc = {
      id: item.id || uid(),
      date: item.date || dateKey(),
      timestamp: item.timestamp || Date.now(),
      name: String(item.name || 'Food item').trim(),
      serving: String(item.serving || '1 serving').trim(),
      // 4 METRICS ONLY:
      calories: Math.max(0, num(item.calories)),
      protein: Math.max(0, num(item.protein)),
      sugar: Math.max(0, num(item.sugar)),
      sodium: Math.max(0, num(item.sodium)),
      mealType: item.mealType || 'Meal', // 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Meal'
      barcode: item.barcode || null,
      photoUrl: item.photoUrl || null,
    };
    await this.adapter.put('foodLog', doc);
    return doc;
  }

  async updateFoodLogItem(item) {
    await this.adapter.put('foodLog', item);
    return item;
  }

  async removeFoodLogItem(id) {
    await this.adapter.remove('foodLog', id);
  }

  /* ========================================================================
     STAPLES (Quick-Add foods)
     ======================================================================== */
  async getStaples() {
    const list = await this.adapter.getAll('staples');
    return (list || []).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveStaple(item) {
    const doc = {
      id: item.id || uid(),
      name: String(item.name || '').trim(),
      serving: String(item.serving || '1 serving').trim(),
      calories: Math.max(0, num(item.calories)),
      protein: Math.max(0, num(item.protein)),
      sugar: Math.max(0, num(item.sugar)),
      sodium: Math.max(0, num(item.sodium)),
      createdAt: item.createdAt || Date.now(),
    };
    await this.adapter.put('staples', doc);
    return doc;
  }

  async deleteStaple(id) {
    await this.adapter.remove('staples', id);
  }

  /* ========================================================================
     WATER INTAKE LOG
     ======================================================================== */
  async getWater(dateStr = dateKey()) {
    const doc = await this.adapter.get('water', dateStr);
    return doc || { id: dateStr, date: dateStr, amount: 0, updatedAt: 0 };
  }

  async setWater(dateStr, amount) {
    const safeAmount = Math.max(0, num(amount));
    const doc = {
      id: dateStr,
      date: dateStr,
      amount: safeAmount,
      updatedAt: Date.now(),
    };
    await this.adapter.put('water', doc);
    return doc;
  }

  async addWater(dateStr, delta) {
    const current = await this.getWater(dateStr);
    const newAmount = Math.max(0, (current.amount || 0) + num(delta));
    return this.setWater(dateStr, newAmount);
  }

  /* ========================================================================
     SPLITS & SCHEDULE OVERRIDES
     ======================================================================== */
  async getSplits() {
    return this.adapter.getAll('splits');
  }

  async getActiveSplit() {
    const splits = await this.getSplits();
    return splits.find((s) => s.isActive) || splits[0] || null;
  }

  async setActiveSplit(id) {
    const splits = await this.getSplits();
    for (const s of splits) {
      s.isActive = s.id === id;
      await this.adapter.put('splits', s);
    }
  }

  async saveSplit(split) {
    if (!split.id) split.id = uid();
    await this.adapter.put('splits', split);
    return split;
  }

  async deleteSplit(id) {
    await this.adapter.remove('splits', id);
  }

  /** Update the exercises that auto-fill when a split day's workout is started. */
  async updateSplitDayExercises(splitId, dayId, exerciseIds) {
    const split = await this.adapter.get('splits', splitId);
    if (!split) throw new Error('Split not found');
    const day = (split.days || []).find((d) => d.id === dayId);
    if (!day) throw new Error('Split day not found');
    day.exerciseIds = [...exerciseIds];
    await this.adapter.put('splits', split);
    return split;
  }

  async getPlanForDate(dateStr = dateKey()) {
    const [split, overrides] = await Promise.all([this.getActiveSplit(), this.getAllOverrides()]);
    return planForDate(split, overrides, dateStr);
  }

  async getOverride(dateStr) {
    const all = await this.getAllOverrides();
    return all.find((o) => o.date === dateStr || o.id === dateStr);
  }

  async getAllOverrides() {
    return this.adapter.getAll('overrides');
  }

  /** Point a specific date at a different split day (by id). */
  async setOverride(dateStr, dayId) {
    await this.removeOverride(dateStr);
    const doc = { id: dateStr, date: dateStr, dayId };
    await this.adapter.put('overrides', doc);
    return doc;
  }

  async removeOverride(dateStr) {
    // Also cleans up legacy overrides that were keyed by the split-day id.
    const all = await this.getAllOverrides();
    for (const o of all) {
      if (o.id === dateStr || o.date === dateStr) await this.adapter.remove('overrides', o.id);
    }
  }

  /* ========================================================================
     DATA MANAGEMENT: EXPORT / IMPORT BACKUP JSON
     ======================================================================== */
  async exportAllData() {
    const backup = {
      app: 'FitTrack',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {},
    };

    for (const col of BACKUP_COLLECTIONS) {
      try {
        backup.data[col] = await this.adapter.getAll(col);
      } catch (err) {
        console.warn(`[repo] export error on collection ${col}:`, err);
        backup.data[col] = [];
      }
    }

    return backup;
  }

  async importAllData(backupJson) {
    if (!backupJson || !backupJson.data) {
      throw new Error('Invalid backup file format: missing "data" property');
    }

    for (const col of BACKUP_COLLECTIONS) {
      if (Array.isArray(backupJson.data[col])) {
        // Clear existing and bulk-write imported docs
        await this.adapter.clear(col);
        if (backupJson.data[col].length > 0) {
          await this.adapter.bulkPut(col, backupJson.data[col]);
        }
      }
    }

    return true;
  }

  async resetToDefaults() {
    for (const col of BACKUP_COLLECTIONS) {
      await this.adapter.clear(col);
    }
    await this.clearActiveWorkout();
    await this._seedDefaultsIfEmpty();
  }
}

export const repo = new Repository();
