/* ==========================================================================
   UI primitives: toast, bottom sheet, action sheet, iOS-style confirm alert.
   ========================================================================== */
import { esc } from './utils.js';
import { icon } from './icons.js';

/* ---------- Toast ---------- */
export function toast(message, { type = '', action, onAction, duration = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-msg">${esc(message)}</span>${action ? `<button class="toast-action">${esc(action)}</button>` : ''}`;
  root.appendChild(el);
  void el.offsetWidth; // force reflow so the transition runs
  el.classList.add('show');
  const remove = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 260); };
  const t = setTimeout(remove, action ? Math.max(duration, 4500) : duration);
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => { clearTimeout(t); remove(); onAction?.(); });
  }
  el.addEventListener('click', (e) => { if (!e.target.closest('.toast-action')) { clearTimeout(t); remove(); } });
  while (root.children.length > 3) root.firstElementChild.remove();
}

/* ---------- Light haptic (Android/Chrome; iOS Safari ignores vibrate) ---------- */
export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* noop */ }
}

/* ---------- Bottom sheet ---------- */
export function openSheet({ title = '', html = '', footer = '', full = false, className = '', onMount, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const existingSheets = document.querySelectorAll('.sheet-overlay').length;
  if (existingSheets > 0) {
    overlay.style.zIndex = String(100 + existingSheets * 10);
  }
  overlay.innerHTML = `
    <div class="sheet ${full ? 'sheet-full' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"><div class="sheet-grabber"></div></div>
      <div class="sheet-header">
        <h3 class="sheet-title">${esc(title)}</h3>
        <button class="icon-btn sheet-close" aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="sheet-body">${html}</div>
      <div class="sheet-footer">${footer}</div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('sheet-open');
  void overlay.offsetWidth;
  overlay.classList.add('open');

  const sheetEl = overlay.querySelector('.sheet');
  let closed = false;
  const api = {
    el: overlay,
    sheet: sheetEl,
    body: overlay.querySelector('.sheet-body'),
    footer: overlay.querySelector('.sheet-footer'),
    setTitle(t) { overlay.querySelector('.sheet-title').textContent = t; },
    get closed() { return closed; },
    close() {
      if (closed) return;
      closed = true;
      try { onClose?.(); } catch (e) { console.error(e); }
      overlay.classList.remove('open');
      sheetEl.style.transform = '';
      setTimeout(() => {
        overlay.remove();
        if (!document.querySelector('.sheet-overlay')) document.body.classList.remove('sheet-open');
      }, 300);
    },
  };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) api.close(); });
  overlay.querySelector('.sheet-close').addEventListener('click', api.close);

  // Swipe-down-to-dismiss from the grabber / header
  let startY = null, dy = 0;
  const handle = [overlay.querySelector('.sheet-grab'), overlay.querySelector('.sheet-header')];
  handle.forEach((h) => {
    h.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; dy = 0; sheetEl.style.transition = 'none'; }, { passive: true });
    h.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      sheetEl.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    h.addEventListener('touchend', () => {
      sheetEl.style.transition = '';
      if (dy > 110) api.close(); else sheetEl.style.transform = '';
      startY = null;
    });
  });

  onMount?.(api);
  return api;
}

/* ---------- Action sheet ---------- */
export function actionSheet({ title = '', actions = [] }) {
  return openSheet({
    title,
    html: `<div class="list">${actions.map((a, i) => `
      <button class="list-item action-item ${a.danger ? 'danger' : ''}" data-i="${i}">
        ${a.icon ? icon(a.icon, 20) : ''}<span>${esc(a.label)}</span>
      </button>`).join('')}</div>`,
    onMount(s) {
      s.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        s.close();
        actions[Number(b.dataset.i)].onClick?.();
      });
    },
  });
}

/* ---------- iOS-style alert / confirm ---------- */
export function confirmDialog(message, { title = 'Are you sure?', okText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'alert-overlay';
    o.innerHTML = `
      <div class="alert" role="alertdialog" aria-modal="true">
        <div class="alert-body">
          <div class="alert-title">${esc(title)}</div>
          ${message ? `<div class="alert-msg">${esc(message)}</div>` : ''}
        </div>
        <div class="alert-actions ${cancelText ? '' : 'single'}">
          ${cancelText ? `<button data-r="0">${esc(cancelText)}</button>` : ''}
          <button data-r="1" class="strong ${danger ? 'danger' : ''}">${esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(o);
    void o.offsetWidth;
    o.classList.add('open');
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      o.classList.remove('open');
      setTimeout(() => o.remove(), 200);
      resolve(b.dataset.r === '1');
    });
  });
}

export const alertDialog = (message, title = 'Notice') => confirmDialog(message, { title, cancelText: '' });
