/* ==========================================================================
   AI Meal Photo Estimator (Gemini Vision API — default model: gemini-3.8-flash)
   - Fast image capture & optimized canvas JPEG compression (800px / 0.7 quality)
   - Real-time animated scan progress modal with live timer & cancel support
   - Streamlined Gemini Vision prompt with maxOutputTokens constraint for speed
   - Configurable model string in Settings (settings.geminiModel)
   - Review & edit modal before logging
   ========================================================================== */

import { $, num, round, esc } from '../utils.js';
import { openSheet, toast, haptic } from '../ui.js';
import { icon } from '../icons.js';
import { repo } from '../store/repository.js';
import { geminiEndpoint, normalizeModel, prettyModelName } from '../data/gemini.js';

class MealAiEstimator {
  init({ onLogged } = {}) {
    const input = $('#meal-photo-input');
    if (!input) return;

    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so selecting the same photo again fires change
      input.value = '';
      await this.processImage(file, onLogged);
    });
  }

  triggerPhotoCapture() {
    const input = $('#meal-photo-input');
    if (input) {
      input.click();
    }
  }

  async processImage(file, onLogged) {
    const settings = await repo.getSettings();
    const apiKey = settings.geminiApiKey?.trim();

    if (!apiKey) {
      toast('Please set your Gemini API key in Settings first', {
        type: 'warn',
        action: 'Settings',
        onAction: () => {
          document.querySelector('.tab[data-tab="settings"]')?.click();
        },
      });
      return;
    }

    const abortController = new AbortController();
    const progressModal = this.openProgressModal({
      onCancel: () => {
        abortController.abort();
      },
    });

    // Step timeouts for realistic visual progress while awaiting network
    let stepTimers = [];

    try {
      // Step 1: Optimize photo
      progressModal.setStep(0);
      const { base64Data, dataUrl } = await this.compressImage(file, 800, 0.7);
      progressModal.setThumbnail(dataUrl);
      progressModal.markDone(0);

      // Step 2: Contact Gemini API
      progressModal.setStep(1);
      const model = normalizeModel(settings.geminiModel);

      // Schedule subsequent visual steps while fetch is in-flight
      stepTimers.push(setTimeout(() => {
        progressModal.markDone(1);
        progressModal.setStep(2);
      }, 1500));

      stepTimers.push(setTimeout(() => {
        progressModal.markDone(2);
        progressModal.setStep(3);
      }, 3500));

      const estimate = await this.callGeminiVision(apiKey, base64Data, model, abortController.signal);
      estimate.model = model;

      // Clear scheduled step timers
      stepTimers.forEach(clearTimeout);

      // Final complete state
      progressModal.markDone(0);
      progressModal.markDone(1);
      progressModal.markDone(2);
      progressModal.markDone(3);
      progressModal.setStatus('✓ Analysis Complete!', 'Opening nutrition review...');

      haptic([30, 60]);
      await new Promise((r) => setTimeout(r, 400));
      progressModal.close();

      this.openReviewSheet(estimate, dataUrl, onLogged);
    } catch (err) {
      stepTimers.forEach(clearTimeout);
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        progressModal.close();
        toast('Food scan cancelled');
        return;
      }
      console.error('[MealAi] Analysis failed:', err);
      progressModal.showError(err.message || 'AI analysis failed');
    }
  }

  openProgressModal({ onCancel } = {}) {
    const startTime = Date.now();
    let timerId = null;

    const html = `
      <div class="scan-progress-wrap">
        <div class="scan-thumb-container" id="scan-thumb-box">
          <div class="scan-radar-line"></div>
          <div id="scan-thumb-placeholder" class="text-subtle">${icon('camera', 36)}</div>
        </div>

        <div class="scan-status-header">
          <h3 class="scan-status-title" id="scan-status-title">Analyzing Meal Photo</h3>
          <p class="scan-status-subtitle" id="scan-status-sub">Estimating visible foods and portions...</p>
        </div>

        <div class="scan-timer-pill" id="scan-timer">
          ${icon('timer', 13)} Elapsed: <span id="scan-elapsed">0.0s</span>
        </div>

        <div class="scan-steps-list">
          <div class="scan-step-row active" id="scan-step-0">
            <span class="scan-step-dot">1</span>
            <span class="scan-step-text">Optimizing photo for Vision AI</span>
          </div>
          <div class="scan-step-row" id="scan-step-1">
            <span class="scan-step-dot">2</span>
            <span class="scan-step-text">Connecting to Gemini AI</span>
          </div>
          <div class="scan-step-row" id="scan-step-2">
            <span class="scan-step-dot">3</span>
            <span class="scan-step-text">Detecting food items & portions</span>
          </div>
          <div class="scan-step-row" id="scan-step-3">
            <span class="scan-step-dot">4</span>
            <span class="scan-step-text">Calculating 4 nutrition metrics</span>
          </div>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'AI Food Scanner',
      html,
      footer: `
        <button class="btn btn-secondary btn-block" id="btn-cancel-scan">Cancel Scan</button>
      `,
      onMount: (sheetApi) => {
        $('#btn-cancel-scan', sheetApi.footer)?.addEventListener('click', () => {
          clearInterval(timerId);
          sheet.close();
          onCancel?.();
        });
      },
      onClose: () => {
        clearInterval(timerId);
      },
    });

    const elapsedEl = $('#scan-elapsed', sheet.body);
    timerId = setInterval(() => {
      if (elapsedEl) {
        const sec = ((Date.now() - startTime) / 1000).toFixed(1);
        elapsedEl.textContent = `${sec}s`;
      }
    }, 100);

    return {
      sheet,
      setThumbnail(url) {
        const box = $('#scan-thumb-box', sheet.body);
        if (box) {
          box.innerHTML = `
            <img src="${url}" class="scan-thumb-img" alt="Meal">
            <div class="scan-radar-line"></div>
          `;
        }
      },
      setStep(idx) {
        for (let i = 0; i <= 3; i++) {
          const row = $(`#scan-step-${i}`, sheet.body);
          if (!row) continue;
          if (i < idx) {
            row.className = 'scan-step-row done';
            const dot = row.querySelector('.scan-step-dot');
            if (dot) dot.textContent = '✓';
          } else if (i === idx) {
            row.className = 'scan-step-row active';
            const dot = row.querySelector('.scan-step-dot');
            if (dot) dot.textContent = String(i + 1);
          } else {
            row.className = 'scan-step-row';
            const dot = row.querySelector('.scan-step-dot');
            if (dot) dot.textContent = String(i + 1);
          }
        }
      },
      markDone(idx) {
        const row = $(`#scan-step-${idx}`, sheet.body);
        if (row) {
          row.className = 'scan-step-row done';
          const dot = row.querySelector('.scan-step-dot');
          if (dot) dot.textContent = '✓';
        }
      },
      setStatus(title, sub) {
        const titleEl = $('#scan-status-title', sheet.body);
        const subEl = $('#scan-status-sub', sheet.body);
        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = sub;
      },
      showError(msg) {
        clearInterval(timerId);
        const titleEl = $('#scan-status-title', sheet.body);
        const subEl = $('#scan-status-sub', sheet.body);
        if (titleEl) {
          titleEl.textContent = 'Analysis Failed';
          titleEl.style.color = 'var(--danger)';
        }
        if (subEl) subEl.textContent = msg;
        const btn = $('#btn-cancel-scan', sheet.footer);
        if (btn) btn.textContent = 'Close';
      },
      close() {
        clearInterval(timerId);
        sheet.close();
      },
    };
  }

  compressImage(file, maxDimension = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      let objectUrl = null;
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (err) {
        // Fallback to FileReader if createObjectURL fails
        const reader = new FileReader();
        reader.onload = (e) => this._drawImage(e.target.result, maxDimension, quality, resolve, reject);
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
        return;
      }

      this._drawImage(
        objectUrl,
        maxDimension,
        quality,
        (res) => {
          URL.revokeObjectURL(objectUrl);
          resolve(res);
        },
        (err) => {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      );
    });
  }

  _drawImage(src, maxDimension, quality, resolve, reject) {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64Data = dataUrl.split(',')[1];
      resolve({ base64Data, dataUrl, width, height });
    };
    img.onerror = () => reject(new Error('Failed to decode image file'));
    img.src = src;
  }

  async callGeminiVision(apiKey, base64Image, model, signal) {
    const endpoint = geminiEndpoint(model, apiKey);

    const promptText = `
You are an expert nutrition analyst.
Analyze this meal photo carefully.
Identify visible food items and estimate their portion sizes.
Calculate and return STRICTLY a JSON object with ONLY these 4 nutritional metrics (no carbs, no fat, no markdown formatting outside JSON):
{
  "name": "Short descriptive meal title (e.g., Grilled Chicken Rice Bowl)",
  "items": ["Item with portion estimate"],
  "calories": 620,
  "protein_g": 45,
  "sugar_g": 3.5,
  "sodium_mg": 480,
  "notes": "Short sentence explaining portion estimate"
}
`.trim();

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `API error ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch { /* noop */ }
      throw new Error(errMsg);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new Error('No response generated by Gemini model');
    }

    // Clean any markdown fences if present
    const cleaned = candidate.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      name: parsed.name || 'AI Analyzed Meal',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      calories: Math.round(num(parsed.calories)),
      protein: round(num(parsed.protein_g ?? parsed.protein), 1),
      sugar: round(num(parsed.sugar_g ?? parsed.sugar), 1),
      sodium: Math.round(num(parsed.sodium_mg ?? parsed.sodium)),
      notes: parsed.notes || '',
    };
  }

  openReviewSheet(estimate, photoDataUrl, onLogged) {
    const itemsListHtml = (estimate.items || [])
      .map((it) => `<li>${esc(it)}</li>`)
      .join('');

    const html = `
      <div class="food-edit-form">
        <div class="ai-preview-box">
          ${photoDataUrl ? `<img src="${photoDataUrl}" class="ai-thumbnail" alt="Meal preview">` : ''}
          <div class="ai-preview-info">
            <span class="badge badge-accent">${esc(prettyModelName(estimate.model))}</span>
            <div class="ai-notes">${esc(estimate.notes || 'Portions estimated from photo')}</div>
          </div>
        </div>

        <div class="form-group">
          <label>Meal Name</label>
          <input type="text" id="ai-name" class="text-input" value="${esc(estimate.name)}">
        </div>

        ${itemsListHtml ? `
        <div class="form-group">
          <label>Detected Foods</label>
          <ul class="ai-items-list">${itemsListHtml}</ul>
        </div>` : ''}

        <div class="form-row">
          <div class="form-group flex-1">
            <label>Meal Type</label>
            <select id="ai-meal-type" class="text-input select-input">
              <option value="Breakfast">Breakfast</option>
              <option value="Lunch" selected>Lunch</option>
              <option value="Dinner">Dinner</option>
              <option value="Snack">Snack</option>
            </select>
          </div>
          <div class="form-group flex-1">
            <label>Serving Label</label>
            <input type="text" id="ai-serving" class="text-input" value="1 plate / bowl">
          </div>
        </div>

        <div class="nutrition-grid-4">
          <div class="nutri-cell">
            <span class="nutri-label">Calories</span>
            <input type="number" id="ai-cal" class="text-input mini-input" value="${estimate.calories}">
            <span class="nutri-unit">kcal</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Protein</span>
            <input type="number" id="ai-pro" class="text-input mini-input" value="${estimate.protein}" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sugar</span>
            <input type="number" id="ai-sug" class="text-input mini-input" value="${estimate.sugar}" step="0.5">
            <span class="nutri-unit">g</span>
          </div>
          <div class="nutri-cell">
            <span class="nutri-label">Sodium</span>
            <input type="number" id="ai-sod" class="text-input mini-input" value="${estimate.sodium}" step="10">
            <span class="nutri-unit">mg</span>
          </div>
        </div>

        <div class="form-actions-stack">
          <button class="btn btn-primary btn-block" id="btn-ai-save">${icon('plus', 18)} Add to Food Log</button>
          <button class="btn btn-secondary btn-block" id="btn-ai-staple">${icon('star', 18)} Save as Staple & Log</button>
        </div>
      </div>
    `;

    const sheet = openSheet({
      title: 'Review AI Nutrition Estimate',
      html,
      onMount: (sheetApi) => {
        const nameInput = $('#ai-name', sheetApi.body);
        const mealTypeSelect = $('#ai-meal-type', sheetApi.body);
        const servingInput = $('#ai-serving', sheetApi.body);
        const calInput = $('#ai-cal', sheetApi.body);
        const proInput = $('#ai-pro', sheetApi.body);
        const sugInput = $('#ai-sug', sheetApi.body);
        const sodInput = $('#ai-sod', sheetApi.body);

        const getPayload = () => ({
          name: nameInput?.value?.trim() || 'Photo Meal',
          serving: servingInput?.value?.trim() || '1 meal',
          mealType: mealTypeSelect?.value || 'Meal',
          calories: num(calInput?.value),
          protein: num(proInput?.value),
          sugar: num(sugInput?.value),
          sodium: num(sodInput?.value),
          photoUrl: photoDataUrl ? photoDataUrl.slice(0, 100) + '...' : null, // keep metadata light
        });

        $('#btn-ai-save', sheetApi.body)?.addEventListener('click', async () => {
          const payload = getPayload();
          await repo.addFoodLogItem(payload);
          toast(`Added ${payload.name} to log`, { type: 'success' });
          sheet.close();
          onLogged?.();
        });

        $('#btn-ai-staple', sheetApi.body)?.addEventListener('click', async () => {
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

export const mealAi = new MealAiEstimator();
