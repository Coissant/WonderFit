/* ==========================================================================
   FitTrack — App Entry Point & Tab Router
   - Initializes swappable storage repository & seeds data
   - Mounts 4 core modules: Dashboard, Live Workout, Nutrition, Settings
   - Manages floating Rest Timer & active workout tab indicators
   - Service Worker registration for PWA offline support
   ========================================================================== */

import { $, $$ } from './utils.js';
import { repo } from './store/repository.js';
import { applyTheme } from './theme.js';
import { unlockAudio } from './timers.js';
import { restTimer } from './components/rest-timer.js';

import { dashboardView } from './views/dashboard.js';
import { workoutView } from './views/workout.js';
import { nutritionView } from './views/nutrition.js';
import { settingsView } from './views/settings.js';

class FitTrackApp {
  currentTab = 'dashboard';
  viewsMounted = new Set();

  async init() {
    try {
      // 1. Initialize storage repository
      await repo.init();

      // 2. Load user settings & apply theme
      const settings = await repo.getSettings();
      applyTheme({ theme: settings.theme, accent: settings.accent });

      // 3. Initialize floating rest timer
      restTimer.init();

      // 4. Setup global user gesture audio unlock
      this.setupAudioUnlock();

      // 5. Mount initial views
      this.setupNavigation();

      // 6. Restore tab from hash or default to dashboard (or workout if one is active!)
      const activeWorkout = await repo.getActiveWorkout();
      const hashTab = location.hash.replace('#', '');
      const initialTab = ['dashboard', 'workout', 'nutrition', 'settings'].includes(hashTab)
        ? hashTab
        : (activeWorkout ? 'workout' : 'dashboard');

      await this.switchTab(initialTab);

      // 7. Update live workout dot indicator
      this.updateActiveWorkoutIndicator();

      // 8. Register Service Worker for offline PWA capabilities
      this.registerServiceWorker();

      // Remove booting class for smooth fade in
      document.body.classList.remove('booting');
    } catch (err) {
      console.error('[FitTrackApp] Boot error:', err);
      document.body.innerHTML = `
        <div style="padding:2rem;color:#ff453a;font-family:sans-serif;">
          <h2>Failed to initialize FitTrack</h2>
          <p>${err.message || 'Unknown error'}</p>
          <button onclick="location.reload()" style="padding:10px 16px;background:#30D158;border:none;border-radius:8px;font-weight:bold;color:#000;">Retry</button>
        </div>
      `;
    }
  }

  setupAudioUnlock() {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  setupNavigation() {
    const tabs = $$('.tab-bar .tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = tab.dataset.tab;
        if (tabName) this.switchTab(tabName);
      });
    });

    window.addEventListener('hashchange', () => {
      const tab = location.hash.replace('#', '');
      if (['dashboard', 'workout', 'nutrition', 'settings'].includes(tab) && tab !== this.currentTab) {
        this.switchTab(tab);
      }
    });
  }

  async switchTab(tabName) {
    if (!['dashboard', 'workout', 'nutrition', 'settings'].includes(tabName)) return;

    this.currentTab = tabName;
    location.hash = tabName;

    // Update tab bar buttons
    $$('.tab-bar .tab').forEach((tab) => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Update view sections
    $$('.view').forEach((v) => {
      const isCurrent = v.dataset.view === tabName;
      v.classList.toggle('active', isCurrent);
    });

    // Mount or refresh the selected view
    const viewContainer = $(`#view-${tabName}`);
    if (viewContainer) {
      if (!this.viewsMounted.has(tabName)) {
        this.viewsMounted.add(tabName);
        if (tabName === 'dashboard') await dashboardView.init(viewContainer);
        else if (tabName === 'workout') await workoutView.init(viewContainer);
        else if (tabName === 'nutrition') await nutritionView.init(viewContainer);
        else if (tabName === 'settings') await settingsView.init(viewContainer);
      } else {
        if (tabName === 'dashboard') await dashboardView.refresh();
        else if (tabName === 'workout') await workoutView.refresh();
        else if (tabName === 'nutrition') await nutritionView.refresh();
        else if (tabName === 'settings') await settingsView.refresh();
      }
    }

    // Scroll to top of view
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.updateActiveWorkoutIndicator();
  }

  async updateActiveWorkoutIndicator() {
    const active = await repo.getActiveWorkout();
    const dot = $('.tab[data-tab="workout"] .tab-dot');
    if (dot) {
      dot.style.display = active ? 'block' : 'none';
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.info('[sw] Service Worker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[sw] Service Worker registration failed:', err);
        });
    }
  }
}

export const app = new FitTrackApp();

// Boot application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
