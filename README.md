# FitTrack — iPhone Fitness & Nutrition PWA

A mobile-first, offline-ready Progressive Web App (PWA) built specifically for iPhone Safari with pure Vanilla HTML5, CSS3, and modern ES modules. **No Node.js build step or bundler is required** — the repository can be pushed directly to GitHub and hosted immediately on **GitHub Pages**.

---

## 🚀 Key Features

### 1. Live Workout Tracker
- **Active Session Stopwatch**: Live elapsed time counter at the top of the screen utilizing `Date.now()` timestamp deltas so time remains 100% accurate even when the iPhone screen locks or the browser is backgrounded.
- **Categorized Exercise Database & Custom Exercises**: Pre-populated with Compound, Push, Pull, Legs, and Core weightlifting exercises. Users can search and create custom exercises on the fly.
- **Previous Performance Memory (CRITICAL)**: Automatically queries the user's workout history to display the exact weight and reps lifted last time (e.g. `185 lbs × 8`) as placeholder and reference indicators directly next to the set input fields.
- **Automated Rest Timer**: Configurable countdown timer (default 90s, adjustable with `+15s` / `-15s` buttons) that starts automatically upon completing a set. Alerts with a Web Audio 3-tone chime and haptic vibration pattern when rest expires.
- **Active Workout Persistence**: Active workouts are continuously saved in local storage; refreshing the page or switching tabs will never lose your logged sets.

### 2. Streamlined Nutrition Tracker (Strictly 4 Metrics Only)
- **4 Metrics Tracked**: **Calories (kcal)**, **Protein (g)**, **Sugar (g)**, and **Sodium (mg)**. Uncluttered UI with zero fat, carb, or micronutrient bloat.
- **Daily Progress Bars**: Real-time progress vs user-defined daily goals with dynamic "left" / "over" badges and goal achievement feedback.
- **Barcode Scanner (Open Food Facts API)**: Integrated with `html5-qrcode` to scan product UPC/EAN barcodes with the rear camera or manual code input. Fetches `world.openfoodfacts.org/api/v2/product/{barcode}.json` and extracts energy-kcal, proteins, sugars, and converts sodium/salt accurately to milligrams (mg). Allows scaling by serving weight before logging.
- **AI Meal Photo Estimator (Gemini 3.8 Flash Vision)**: Snap a photo directly through iOS camera (`<input type="file" accept="image/*" capture="environment">`). Resizes and compresses onto an HTML5 canvas to high-performance JPEG base64, then prompts Google Gemini Flash (defaulting to `gemini-3.8-flash`, fully customizable in Settings) for strict 4-metric JSON. Provides a preview sheet allowing user review and number adjustments before saving.
- **Quick-Add & Saved Staples**: 1-tap logging for recurring meals with pre-seeded staple foods (Protein shake, chicken breast, greek yogurt, rice, eggs).

### 3. Workout Calendar & Monthly Split Builder
- **Split Designer**: Build 7-day weekly splits (Mon–Sun) or custom rotation cycles (e.g. 4-day Push / Pull / Legs / Rest). Includes ready-to-use presets (PPL, Upper/Lower, Full Body 3×) and custom exercise assignments.
- **Interactive Monthly Calendar View**: Color-coded calendar cells:
  - 🟢 **Completed Workout**: Displays finished volume, duration, and exercise breakdown.
  - 🔵 **Scheduled Split Day**: Shows planned routine with a prominent **"Start This Workout"** button that loads the exercises directly into the Live Workout Tracker.
  - ⚪ **Rest Day**: Recovery day indicator with options to schedule or override.
- **Date Overrides**: Swap or reassign any specific date to a different split day or rest day.

### 4. Settings & UI Customization
- **iOS-Native Aesthetic**: Built for iOS Safari with dark mode and pure OLED black (`#000000`) toggle.
- **Accent Color Picker**: Live customizable primary accent color via CSS custom properties with preset iOS colors (Green, Blue, Teal, Purple, Pink, Red, Orange, Yellow) and custom hex picker.
- **Daily Goals**: Configurable target inputs for Calories, Protein, Sugar, and Sodium.
- **Preferences**: Weight unit toggle (`lbs` vs `kg`) and default rest duration selector (60s, 90s, 120s, 180s, 240s).
- **Gemini API Key**: Securely stored strictly on the local device (`repo.saveSettings`) with a test key connection button.
- **Data Backup & Restore**:
  - **Export All Data (JSON)**: Downloads a complete JSON snapshot of all workouts, food logs, split definitions, staples, and settings.
  - **Import Data (JSON)**: Restores from any backup file with schema validation and one-tap restore.
- **Safe Area & Safari Zoom Prevention**: All `<input>`, `<select>`, and `<textarea>` elements are enforced at `font-size: 16px` to permanently prevent iOS Safari auto-zooming. Supports `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

---

## 🛠 Modular Storage Architecture (Swappable to Firestore)

All database operations pass through the unified repository (`js/store/repository.js`), abstracting away storage backends.

To swap to **Firebase Firestore**:
1. Open `js/store/config.js`.
2. Change `STORAGE_BACKEND = 'firestore'`.
3. Fill in your `FIREBASE_CONFIG` credentials:
   ```javascript
   export const STORAGE_BACKEND = 'firestore';

   export const FIREBASE_CONFIG = {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-app",
     storageBucket: "your-app.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
4. `js/store/firestore-adapter.js` automatically handles offline caching and Firestore sync!

---

## 📦 How to Run Locally

You can run any local static web server. For example with Python:
```bash
python -m http.server 8000
```
Open `http://localhost:8000` in your browser or iPhone (connected on the same local Wi-Fi).

---

## 📲 How to Install as an iPhone PWA

1. Host the files on **GitHub Pages** (Settings → Pages → Source: `main` branch, `/ (root)`).
2. Open your GitHub Pages URL in **Safari on your iPhone**.
3. Tap the **Share** button (box with an arrow pointing up at the bottom of the screen).
4. Tap **"Add to Home Screen"**.
5. Tap **Add** in the top right corner. FitTrack will launch as a full-screen, standalone app with its custom app icon!
