/* ==========================================================================
   Barcode Scanner Component (Open Food Facts + html5-qrcode)
   - Dynamic CDN load of html5-qrcode
   - iPhone rear camera capture (facingMode: environment)
   - Manual barcode input fallback
   - Open Food Facts API v2 integration
   - Accurate 4-metric extraction (calories, protein, sugar, sodium in mg)
   - Serving size scaling & logging sheet
   ========================================================================== */

import { loadScript, num, round, esc, $ } from '../utils.js';
import { openSheet, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { repo } from '../store/repository.js';

const HTML5_QRCODE_CDN = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

export class BarcodeScanner {
  html5QrCode = null;
  sheet = null;

  async open({ onLogged } = {}) {
    let loaded = false;
    try {
      await loadScript(HTML5_QRCODE_CDN);
      loaded = typeof window.Html5Qrcode !== 'undefined';
    } catch (err) {
      console.warn('Failed to load html5-qrcode:', err);
    }

    const html = `
      <div class="scanner-wrap">
        <div id="qr-reader" class="scanner-viewfinder">
          ${!loaded ? '<div class="scanner-placeholder">Camera library offline. You can enter the barcode manually below.</div>' : '<div class="scanner-aim"><div class="scanner-laser"></div></div>'}
        </div>
        <p class="scanner-hint">Point camera at UPC / EAN barcode on food packaging</p>
        
        <div class="scanner-manual">
          <div class="input-row">
            <input type="text" id="manual-barcode-input" inputmode="numeric" pattern="[0-9]*" placeholder="Or type barcode (e.g. 737628064502)" class="text-input">
            <button class="btn btn-secondary" id="manual-barcode-btn">Lookup</button>
          </div>
        </div>
      </div>
    `;

    this.sheet = openSheet({
      title: 'Scan Barcode',
      html,
      onMount: async (sheetApi) => {
        const manualInput = $('#manual-barcode-input', sheetApi.body);
        const manualBtn = $('#manual-barcode-btn', sheetApi.body);

        manualBtn?.addEventListener('click', () => {
          const code = manualInput?.value?.trim();
          if (code) {
            this.handleBarcode(code, onLogged);
          } else {
            toast('Please enter a barcode number', { type: 'warn' });
          }
        });

        manualInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') manualBtn?.click();
        });

        if (loaded) {
          try {
            this.html5QrCode = new window.Html5Qrcode('qr-reader');
            const qrConfig = { fps: 10, qrbox: { width: 260, height: 160 } };

            await this.html5QrCode.start(
              { facingMode: 'environment' },
              qrConfig,
              (decodedText) => {
                haptic([40, 60, 40]);
                this.stopCamera();
                this.handleBarcode(decodedText, onLogged);
              },
              () => { /* silent scan frame miss */ }
            );
          } catch (camErr) {
            console.warn('Camera start error:', camErr);
            const view = $('#qr-reader', sheetApi.body);
            if (view) {
              view.innerHTML = `<div class="scanner-placeholder">${icon('camera', 32)}<br>Camera access denied or unavailable.<br>Use manual barcode entry below.</div>`;
            }
          }
        }
      },
      onClose: () => {
        this.stopCamera();
      },
    });
  }

  async stopCamera() {
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.isScanning) {
          await this.html5QrCode.stop();
        }
        this.html5QrCode.clear();
      } catch (e) {
        // ignore stop error
      }
      this.html5QrCode = null;
    }
  }

  async handleBarcode(barcode, onLogged) {
    if (this.sheet) {
      this.sheet.close();
      this.sheet = null;
    }

    toast('Looking up product...', { duration: 1500 });

    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (!data || data.status !== 1 || !data.product) {
        toast(`Product not found for barcode ${barcode}`, { type: 'warn' });
        // Offer manual entry
        this.openAdjustSheet({
          barcode,
          name: '',
          serving: '100g',
          base100g: { calories: 0, protein: 0, sugar: 0, sodium: 0 },
        }, onLogged);
        return;
      }

      const p = data.product;
      const n = p.nutriments || {};

      // Product Name
      const name = p.product_name || p.product_name_en || p.brands || 'Scanned Food';
      const brand = p.brands ? ` (${p.brands})` : '';
      const fullName = `${name}${brand}`;

      // Accurate metric parsing:
      // Energy kcal (Open Food Facts sometimes gives kcal directly, or energy-kcal_100g)
      let cal100g = num(n['energy-kcal_100g'] ?? n['energy-kcal_value'] ?? n['energy-kcal']);
      if (!cal100g && n['energy-kj_100g']) {
        cal100g = n['energy-kj_100g'] / 4.184;
      }

      // Protein (g)
      const pro100g = num(n['proteins_100g'] ?? n['proteins_value'] ?? n['proteins']);

      // Sugar (g)
      const sug100g = num(n['sugars_100g'] ?? n['sugars_value'] ?? n['sugars']);

      // Sodium in mg:
      // Open Food Facts sodium_100g is in GRAMS. 1g sodium = 1000mg.
      // Salt in grams: 1g salt ≈ 400mg sodium (0.3934g).
      let sodMg100g = 0;
      if (n['sodium_100g'] != null) {
        sodMg100g = num(n['sodium_100g']) * 1000;
      } else if (n['salt_100g'] != null) {
        sodMg100g = num(n['salt_100g']) * 400;
      }

      const servingDesc = p.serving_size || '100g';
      const servingGrams = num(p.serving_quantity) || 100;

      this.openAdjustSheet({
        barcode,
        name: fullName,
        serving: servingDesc,
        servingGrams,
        base100g: {
          calories: cal100g,
          protein: pro100g,
          sugar: sug100g,
          sodium: sodMg100g,
        },
      }, onLogged);

    } catch (err) {
      console.error('Barcode lookup failed:', err);
      toast('Failed to fetch food facts. Check your internet connection.', { type: 'danger' });
    }
  }

  openAdjustSheet(item, onLogged) {
    const isPer100g = item.servingGrams && item.servingGrams > 0;
    const initialGrams = item.servingGrams || 100;

    const calcValues = (grams) => {
      const ratio = grams / 100;
      return {
        calories: Math.round(item.base100g.calories * ratio),
        protein: round(item.base100g.protein * ratio, 1),
        sugar: round(item.base100g.sugar * ratio, 1),
        sodium: Math.round(item.base100g.sodium * ratio),
      };
    };

    const initial = calcValues(initialGrams);

    const html = `
      <div class="food-edit-form">
        <div class="form-group">
          <label>Food Name</label>
          <input type="text" id="food-name" class="text-input" value="${esc(item.name)}" placeholder="Food name">
        </div>

        <div class="form-row">
          <div class="form-group flex-1">
            <label>Serving Weight (g)</label>
            <input type="number" id="serving-grams" class="text-input" value="${initialGrams}" min="1" step="1">
          </div>
          <div class="form-group flex-1">
            <label>Meal Type</label>
            <select id="meal-type" class="text-input select-input">
              <option value="Breakfast">Breakfast</option>
              <option value="Lunch">Lunch</option>
              <option value="Dinner">Dinner</option>
              <option value="Snack" selected>Snack</option>
            </select>
          </div>
        </div>

        <div class="nutrition-grid-4">
          <div class="nutri-cell">
            <span class="nutri-label">Calories</span>
            <input type="number" id="nutri-cal" class="text-input mini-input" value="${initial.calories}">
            <span class="nutri-unit">kcal</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Protein</span>
            <input type="number" id="nutri-pro" class="text-input mini-input" value="${initial.protein}" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sugar</span>
            <input type="number" id="nutri-sug" class="text-input mini-input" value="${initial.sugar}" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sodium</span>
            <input type="number" id="nutri-sod" class="text-input mini-input" value="${initial.sodium}" step="10">
            <span class="nutri-unit">mg</span>
          </div>
        </div>

        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-save-log">${icon('plus', 18)} Add to Food Log</button>
          <button class="btn btn-secondary btn-block" id="btn-save-staple">${icon('star', 18)} Save as Staple & Log</button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'Scanned Food Details',
      html,
      onMount: (sheetApi) => {
        const gramsInput = $('#serving-grams', sheetApi.body);
        const calInput = $('#nutri-cal', sheetApi.body);
        const proInput = $('#nutri-pro', sheetApi.body);
        const sugInput = $('#nutri-sug', sheetApi.body);
        const sodInput = $('#nutri-sod', sheetApi.body);
        const nameInput = $('#food-name', sheetApi.body);
        const mealTypeSelect = $('#meal-type', sheetApi.body);

        // When serving grams change, recalculate the 4 metrics proportionally
        gramsInput?.addEventListener('input', () => {
          const g = num(gramsInput.value);
          if (g > 0) {
            const calculated = calcValues(g);
            calInput.value = calculated.calories;
            proInput.value = calculated.protein;
            sugInput.value = calculated.sugar;
            sodInput.value = calculated.sodium;
          }
        });

        const getPayload = () => ({
          name: nameInput?.value?.trim() || 'Food Item',
          serving: `${num(gramsInput?.value) || 100}g`,
          mealType: mealTypeSelect?.value || 'Snack',
          calories: num(calInput?.value),
          protein: num(proInput?.value),
          sugar: num(sugInput?.value),
          sodium: num(sodInput?.value),
          barcode: item.barcode || null,
        });

        $('#btn-save-log', sheetApi.body)?.addEventListener('click', async () => {
          const payload = getPayload();
          await repo.addFoodLogItem(payload);
          toast(`Added ${payload.name} to log`, { type: 'success' });
          sheet.close();
          onLogged?.();
        });

        $('#btn-save-staple', sheetApi.body)?.addEventListener('click', async () => {
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
          onLogged?.();
        });
      },
    });
  }
}

export const barcodeScanner = new BarcodeScanner();
