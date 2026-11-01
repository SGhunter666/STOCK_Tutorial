/**
 * Key based internationalisation. All user visible strings live in
 * locales/zh-CN.json and locales/en.json; business logic only references keys.
 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en'];

export function normalizeLocale(locale) {
  if (!locale) return 'en';
  return String(locale).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function detectLocale() {
  try {
    const saved = localStorage.getItem('sma.locale');
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch {
    // ignore
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return normalizeLocale(browser);
}

function readPath(dict, key) {
  const parts = key.split('.');
  let node = dict;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

export class I18n {
  constructor(dictionaries) {
    this.dictionaries = dictionaries;
    this.locale = 'en';
    this.missing = new Set();
    this.listeners = new Set();
  }

  setLocale(locale) {
    const next = normalizeLocale(locale);
    if (next === this.locale) return;
    this.locale = next;
    try {
      localStorage.setItem('sma.locale', next);
    } catch {
      // ignore
    }
    for (const listener of [...this.listeners]) listener(next);
  }

  onChange(handler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  otherLocale(locale = this.locale) {
    return normalizeLocale(locale) === 'zh-CN' ? 'en' : 'zh-CN';
  }

  translate(locale, key, params) {
    const target = normalizeLocale(locale);
    const dict = this.dictionaries[target] || {};
    const fallback = this.dictionaries.en || {};
    let value = readPath(dict, key);
    let usedFallback = false;
    if (value === undefined) {
      value = readPath(fallback, key);
      usedFallback = true;
    }
    if (typeof value !== 'string') {
      if (!this.missing.has(key)) {
        this.missing.add(key);
        console.error(`[i18n] missing translation key: ${key} (locale: ${target})`);
      }
      return `⟦${key}⟧`;
    }
    if (usedFallback && target !== 'en' && !this.missing.has(key)) {
      this.missing.add(key);
      console.error(`[i18n] key "${key}" missing in ${target}, using English fallback`);
    }
    return interpolate(value, params);
  }

  t(key, params) {
    return this.translate(this.locale, key, params);
  }

  /** True when a key exists in both dictionaries — used by tests and dev tools. */
  hasInBoth(key) {
    return readPath(this.dictionaries['zh-CN'] || {}, key) !== undefined
      && readPath(this.dictionaries.en || {}, key) !== undefined;
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}

export async function loadDictionaries() {
  // The single-file offline build embeds both dictionaries before the app bundle.
  if (typeof window !== 'undefined' && window.__SMA_EMBEDDED_LOCALES__) {
    return window.__SMA_EMBEDDED_LOCALES__;
  }
  const [zh, en] = await Promise.all([
    fetchJson('./locales/zh-CN.json'),
    fetchJson('./locales/en.json'),
  ]);
  return { 'zh-CN': zh, en };
}

export function flattenKeys(dict, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(dict || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}
