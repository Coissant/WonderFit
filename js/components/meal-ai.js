/* ==========================================================================
   AI Meal Photo Estimator (Gemini Vision API — default model: gemini-3.8-flash)
   - Image capture & canvas JPEG compression
   - Gemini Vision prompt for strict 4-metric JSON
   - Model string is configurable in Settings (settings.geminiModel)
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

    toast('Compressing image & analyzing food...', { duration: 3500 });

    try {
      const { base64Data, dataUrl } = await this.compressImage(file, 1024, 0.8);
      const model = normalizeModel(settings.geminiModel);
      const estimate = await this.callGeminiVision(apiKey, base64Data, model);
      estimate.model = model;
      haptic([30, 50]);
      this.openReviewSheet(estimate, dataUrl, onLogged);
    } catch (err) {
      console.error('[MealAi] Analysis failed:', err);
      toast(`AI analysis failed: ${err.message || 'Unknown error'}`, { type: 'danger', duration: 4000 });
    }
  }

  compressImage(file, maxDimension = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
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
          resolve({ base64Data, dataUrl });
        };
        img.onerror = () => reject(new Error('Failed to load image file'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async callGeminiVision(apiKey, base64Image, model) {
    const endpoint = geminiEndpoint(model, apiKey);

    const promptText = `
You are a professional nutrition analyst and dietitian.
Analyze this meal photo carefully.
Identify all visible food items and estimate their portions.
Calculate and return STRICTLY AND ONLY the following 4 nutritional metrics:
1. calories (kcal)
2. protein_g (grams)
3. sugar_g (grams)
4. sodium_mg (milligrams)

Do NOT provide carbs, fats, fiber, vitamins, or any other nutrient.
Respond strictly with a single JSON object in this exact schema, with no markdown code blocks and no conversational text:
{
  "name": "Short descriptive meal title (e.g., Grilled Chicken Rice Bowl with Broccoli)",
  "items": ["Item 1 with estimated portion", "Item 2 with estimated portion"],
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
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
