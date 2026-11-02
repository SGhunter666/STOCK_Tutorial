/**
 * Optional external quote feed. The payload is reference data only: it never
 * mutates the deterministic simulated market or the trading account.
 *
 * Accepted shapes:
 *   { "updatedAt": "2026-11-03T09:31:00Z", "quotes": { "AURA": 12.34 } }
 *   { "quotes": [{ "ticker": "AURA", "last": 12.34, "changePct": 1.2 }] }
 *   { "AURA": 12.34 }
 */
const MAX_QUOTES = 80;
const TICKER_PATTERN = /[^A-Z0-9.\-]/g;

function normalizeTicker(value) {
  return String(value || '').toUpperCase().replace(TICKER_PATTERN, '').slice(0, 12);
}

function normalizeQuote(ticker, raw) {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return null;
  let last = null;
  let changePct = null;
  if (typeof raw === 'number') {
    last = raw;
  } else if (raw && typeof raw === 'object') {
    last = Number(raw.last ?? raw.price ?? raw.close);
    const change = Number(raw.changePct ?? raw.change);
    if (Number.isFinite(change)) changePct = change;
  }
  if (!Number.isFinite(last) || last <= 0) return null;
  return {
    ticker: symbol,
    last,
    changePct,
  };
}

export function normalizeLiveFeed(payload, { now = Date.now() } = {}) {
  if (!payload) return { ok: false, error: 'liveFeed.errorEmpty' };
  let entries = [];
  if (Array.isArray(payload)) {
    entries = payload.map((quote) => [quote?.ticker, quote]);
  } else if (Array.isArray(payload.quotes)) {
    entries = payload.quotes.map((quote) => [quote?.ticker, quote]);
  } else if (payload.quotes && typeof payload.quotes === 'object') {
    entries = Object.entries(payload.quotes);
  } else if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    entries = Object.entries(payload.data);
  } else if (typeof payload === 'object') {
    entries = Object.entries(payload).filter(([, value]) => (
      typeof value === 'number' || (value && typeof value === 'object' && !Array.isArray(value))
    ));
  }
  const quotes = entries
    .map(([ticker, raw]) => normalizeQuote(ticker, raw))
    .filter(Boolean)
    .slice(0, MAX_QUOTES);
  if (!quotes.length) return { ok: false, error: 'liveFeed.errorQuotes' };
  const stamp = payload.updatedAt ?? payload.timestamp ?? payload.time;
  const parsed = stamp ? new Date(stamp).getTime() : now;
  return {
    ok: true,
    quotes,
    updatedAt: Number.isFinite(parsed) ? parsed : now,
  };
}

export async function fetchLiveFeed(url, {
  fetchImpl = globalThis.fetch,
  timeout = 8000,
  now = Date.now(),
} = {}) {
  const target = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\/.+/i.test(target)) return { ok: false, error: 'liveFeed.errorUrl' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'liveFeed.errorUnavailable' };
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(1000, timeout)) : null;
  try {
    const response = await fetchImpl(target, {
      signal: controller?.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response || !response.ok) return { ok: false, error: 'liveFeed.errorHttp' };
    const payload = await response.json();
    return normalizeLiveFeed(payload, { now });
  } catch {
    return { ok: false, error: 'liveFeed.errorFetch' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
