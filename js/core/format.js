/**
 * Locale aware formatting. Money stays in virtual USD no matter which language is active:
 * switching language never implies a currency conversion.
 */
const LOCALES = { zh: 'zh-CN', en: 'en' };

export function normalizeLocale(locale) {
  if (!locale) return 'en';
  return String(locale).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function shortLocale(locale) {
  return normalizeLocale(locale) === 'zh-CN' ? 'zh' : 'en';
}

function intlLocale(locale) {
  return LOCALES[shortLocale(locale)];
}

export function money(value, locale = 'en', digits = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  const formatter = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = safe < 0 ? '-' : '';
  return `${sign}$${formatter.format(Math.abs(safe))}`;
}

/** Compact variant for tickers and large market caps: $1.24B / $236.4M */
export function moneyCompact(value, locale = 'en') {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '-' : '';
  const suffix = { zh: ['', '万', '亿', '万亿'], en: ['', 'K', 'M', 'B'] };
  const label = suffix[shortLocale(locale)];
  if (shortLocale(locale) === 'zh') {
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}${label[3]}`;
    if (abs >= 1e8) return `${sign}$${(abs / 1e8).toFixed(2)}${label[2]}`;
    if (abs >= 1e4) return `${sign}$${(abs / 1e4).toFixed(2)}${label[1]}`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function num(value, locale = 'en', digits = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(safe);
}

export function pct(value, locale = 'en', digits = 2, withSign = true) {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = withSign && safe > 0 ? '+' : '';
  return `${sign}${num(safe, locale, digits)}%`;
}

export function signedMoney(value, locale = 'en', digits = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? '+' : safe < 0 ? '-' : '';
  return `${sign}${money(Math.abs(safe), locale, digits)}`;
}

export function shares(value, locale = 'en') {
  return num(value, locale, 0);
}

/** Compact count for volume and shares: 1.2M / 320萬 */
export function compactNumber(value, locale = 'en') {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const zh = shortLocale(locale) === 'zh';
  const trimmed = (v, digits) => v.toFixed(digits).replace(/\.0$/, '');
  if (zh) {
    if (abs >= 1e8) return `${trimmed(abs / 1e8, 2)}亿`;
    if (abs >= 1e4) return `${trimmed(abs / 1e4, 1)}万`;
    return num(abs, locale, 0);
  }
  if (abs >= 1e9) return `${trimmed(abs / 1e9, 1)}B`;
  if (abs >= 1e6) return `${trimmed(abs / 1e6, 1)}M`;
  if (abs >= 1e3) return `${trimmed(abs / 1e3, 1)}K`;
  return num(abs, locale, 0);
}

export function tone(value) {
  if (!Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
