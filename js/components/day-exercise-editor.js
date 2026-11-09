/* ==========================================================================
   Split-Day Exercise Editor
   Configures which exercises AUTO-FILL when a split day's workout starts.
   - Ordered list (order = order in the live workout)
   - Move up / down / remove
   - Searchable, category-filtered "Add" picker with inline custom exercise
   Callers decide how to persist via onSave(exerciseIds).
   ========================================================================== */

import { $, $$, esc } from '../utils.js';
import { openSheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import { repo } from '../store/repository.js';
import { CATEGORIES } from '../data/exercises.js';

export async function openDayExerciseEditor({ title = 'Exercises', dayName = '', exerciseIds = [], saveLabel = 'Save Exercises', onSave } = {}) {
  let all = await repo.getExercises();
  let byId = new Map(all.map((e) => [e.id, e]));
  let ids = (exerciseIds || []).filter((id) => byId.has(id));
  let mode = 'list';
  let query = '';
  let cat = 'All';

  const refreshLibrary = async () => {
    all = await repo.getExercises();
    byId = new Map(all.map((e) => [e.id, e]));
  };

  const listHtml = () => `
    <p class="editor-hint">These exercises auto-fill when you start <strong>${esc(dayName || 'this day')}</strong>. The order here is the order in your workout.</p>
    ${ids.length ? `
      <div class="list editor-list">
        ${ids.map((id, i) => {
          const ex = byId.get(id);
          return `
            <div class="list-item editor-row" data-i="${i}">
              <span class="editor-num">${i + 1}</span>
              <div class="editor-main">
                <div class="item-title">${esc(ex?.name || id)}</div>
                <div class="item-meta">${esc(ex?.category || '')}</div>
              </div>
              <div class="editor-actions">
                <button class="icon-btn sm" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('chevronUp', 18)}</button>
                <button class="icon-btn sm" data-act="down" ${i === ids.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('chevronDown', 18)}</button>
                <button class="icon-btn sm danger" data-act="remove" aria-label="Remove">${icon('x', 18)}</button>
              </div>
            </div>`;
        }).join('')}
      </div>` : '<div class="empty-state-box"><p class="empty-state-title">No exercises yet</p><p class="empty-state-desc">Add the lifts you want pre-loaded for this day.</p></div>'}
    <button class="btn btn-secondary btn-block mt-2" data-act="open-add">${icon('plus', 18)} Add Exercises</button>
  `;

  const resultsHtml = () => {
    const q = query.toLowerCase();
    const filtered = all.filter((e) =>
      (cat === 'All' || (cat === 'Custom' ? e.isCustom : e.category === cat)) &&
      (!q || e.name.toLowerCase().includes(q)));
    if (!filtered.length) return '<div class="empty-state-text">No exercises match. Create it below.</div>';
    return filtered.map((e) => {
      const on = ids.includes(e.id);
      return `
        <button class="list-item pick-row ${on ? 'on' : ''}" data-id="${e.id}">
          <span class="pick-check">${on ? icon('check', 16) : ''}</span>
          <span class="editor-main">
            <span class="item-title">${esc(e.name)}</span>
            <span class="item-meta">${esc(e.category)}${e.isCustom ? ' · Custom' : ''}</span>
          </span>
        </button>`;
    }).join('');
  };

  const addHtml = () => `
    <button class="btn-text-accent back-link" data-act="back">${icon('chevronLeft', 16)} Back to list (${ids.length})</button>
    <div class="search-input-wrap">
      ${icon('search', 16, 'search-icon')}
      <input type="search" id="ed-search" class="text-input search-input" placeholder="Search exercises..." value="${esc(query)}" autocomplete="off">
    </div>
    <div class="filter-pills-row">
      ${['All', ...CATEGORIES, 'Custom'].map((c) => `<button class="filter-pill ${c === cat ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div class="list editor-results" id="ed-results">${resultsHtml()}</div>
    <div class="card inline-create">
      <div class="item-title">Create custom exercise</div>
      <div class="inline-create-row">
        <input type="text" id="ed-new-name" class="text-input" placeholder="e.g. Landmine Press" value="${esc(query)}">
        <select id="ed-new-cat" class="text-input select-input">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>
      </div>
      <button class="btn btn-secondary btn-block btn-sm" data-act="create">${icon('plus', 16)} Create & Add</button>
    </div>
  `;

  const sheet = openSheet({
    title,
    html: '',
    footer: `<button class="btn btn-primary btn-block btn-large" data-act="save">${icon('check', 18)} ${esc(saveLabel)}</button>`,
  });

  const render = () => {
    sheet.body.innerHTML = mode === 'list' ? listHtml() : addHtml();
    if (mode === 'add') {
      const search = $('#ed-search', sheet.body);
      search?.addEventListener('input', () => {
        query = search.value.trim();
        $('#ed-results', sheet.body).innerHTML = resultsHtml();
        const nameField = $('#ed-new-name', sheet.body);
        if (nameField) nameField.value = query;
      });
    }
  };

  sheet.body.addEventListener('click', async (e) => {
    const pill = e.target.closest('.filter-pill');
    if (pill) {
      cat = pill.dataset.cat;
      $$('.filter-pill', sheet.body).forEach((p) => p.classList.toggle('active', p === pill));
      $('#ed-results', sheet.body).innerHTML = resultsHtml();
      return;
    }

    const pick = e.target.closest('.pick-row');
    if (pick) {
      const id = pick.dataset.id;
      ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      $('#ed-results', sheet.body).innerHTML = resultsHtml();
      const back = $('[data-act="back"]', sheet.body);
      if (back) back.innerHTML = `${icon('chevronLeft', 16)} Back to list (${ids.length})`;
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-i]');
    const i = row ? Number(row.dataset.i) : -1;

    switch (btn.dataset.act) {
      case 'up':
        if (i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
        render();
        break;
      case 'down':
        if (i < ids.length - 1) [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
        render();
        break;
      case 'remove':
        ids.splice(i, 1);
        render();
        break;
      case 'open-add':
        mode = 'add';
        render();
        break;
      case 'back':
        mode = 'list';
        render();
        break;
      case 'create': {
        const name = $('#ed-new-name', sheet.body)?.value.trim();
        const category = $('#ed-new-cat', sheet.body)?.value || 'Compound';
        if (!name) { toast('Enter a name for the exercise', { type: 'warn' }); return; }
        if (all.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
          toast('That exercise already exists — search for it above', { type: 'warn' });
          return;
        }
        const created = await repo.addExercise({ name, category, isCustom: true });
        await refreshLibrary();
        ids.push(created.id);
        query = '';
        toast(`Created & added ${created.name}`, { type: 'success' });
        render();
        break;
      }
      default:
        break;
    }
  });

  sheet.footer.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="save"]')) return;
    try {
      await onSave?.([...ids]);
      sheet.close();
    } catch (err) {
      toast(`Could not save: ${err.message}`, { type: 'danger' });
    }
  });

  render();
  return sheet;
}
