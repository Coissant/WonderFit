/* Theme + accent color via CSS variables. Mirrors to localStorage for flash-free first paint. */

export const ACCENT_PRESETS = [
  { name: 'Green', hex: '#30D158' },
  { name: 'Blue', hex: '#0A84FF' },
  { name: 'Teal', hex: '#40C8E0' },
  { name: 'Purple', hex: '#BF5AF2' },
  { name: 'Pink', hex: '#FF375F' },
  { name: 'Red', hex: '#FF453A' },
  { name: 'Orange', hex: '#FF9F0A' },
  { name: 'Yellow', hex: '#FFD60A' },
];

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return { r: 48, g: 209, b: 88 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance({ r, g, b }) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function applyTheme({ theme = 'dark', accent = '#30D158' } = {}) {
  const root = document.documentElement;
  const rgb = hexToRgb(accent);
  const rgbStr = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  const contrast = relativeLuminance(rgb) > 0.35 ? '#000000' : '#FFFFFF';

  root.dataset.theme = theme;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', rgbStr);
  root.style.setProperty('--accent-contrast', contrast);

  const bg = theme === 'oled' ? '#000000' : '#0E0E11';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);

  try {
    localStorage.setItem('fittrack.theme', JSON.stringify({ theme, accent, rgb: rgbStr, contrast }));
  } catch { /* storage full / disabled */ }
}
