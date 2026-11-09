/* Gemini API configuration. The model string is user-configurable in Settings;
   this is only the default used when nothing has been saved yet. */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Trim, strip an accidental "models/" prefix, and fall back to the default. */
export function normalizeModel(model) {
  const s = String(model || '').trim().replace(/^models\//i, '');
  return s || DEFAULT_GEMINI_MODEL;
}

export function geminiEndpoint(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeModel(model))}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/** "gemini-3.8-flash" -> "Gemini 3.8 Flash" (for UI labels) */
export function prettyModelName(model) {
  return normalizeModel(model)
    .split('-')
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}
