/**
 * Historical replay engine: one real daily bar per step, trading at the close.
 * All prices are adjusted for splits and dividends, so returns are continuous.
 */
import {
  buy, sell, equity, marketValue, unrealizedPnl, positionRows, returnPct, createAccount,
} from '../trading/account.js';

export const HISTORY_START_CASH = 10000;
export const HISTORY_FEE = 1;
/** Days loaded before the player starts so the chart has real context. */
export const HISTORY_WARMUP = 20;

export function createHistoryRun(scenarioId, startCash = HISTORY_START_CASH) {
  return {
    scenarioId,
    dayIndex: HISTORY_WARMUP,
    startIndex: HISTORY_WARMUP,
    account: createAccount(startCash),
    selectedTicker: null,
    createdAt: Date.now(),
  };
}

export function ensureHistoryRun(existing, scenarioId, dataset) {
  if (!existing || existing.scenarioId !== scenarioId || !existing.account) {
    return createHistoryRun(scenarioId);
  }
  const maxIndex = barCount(dataset) - 1;
  const trades = Array.isArray(existing.account.trades) ? existing.account.trades : [];
  // Old runs that never traded get the same warm-up window as new runs.
  const minimum = trades.length ? 1 : Math.min(HISTORY_WARMUP, maxIndex);
  const raw = Number(existing.dayIndex);
  const dayIndex = Math.max(minimum, Math.min(Number.isFinite(raw) ? raw : minimum, maxIndex));
  const startIndex = Math.max(1, Math.min(
    Number(existing.startIndex) || (trades.length ? 1 : minimum),
    dayIndex,
  ));
  return { ...existing, dayIndex, startIndex };
}

export function barCount(dataset) {
  if (!dataset || !dataset.tickers || !dataset.tickers.length) return 0;
  return dataset.tickers[0].bars.length;
}

export function tickerData(dataset, symbol) {
  return dataset?.tickers?.find((ticker) => ticker.symbol === symbol) || null;
}

export function currentDate(dataset, dayIndex) {
  const bars = dataset?.tickers?.[0]?.bars;
  return bars && bars[dayIndex] ? bars[dayIndex][0] : '';
}

export function barsFor(dataset, symbol) {
  const ticker = tickerData(dataset, symbol);
  return ticker ? ticker.bars : [];
}

export function quoteAt(dataset, symbol, dayIndex) {
  const bars = barsFor(dataset, symbol);
  const bar = bars[dayIndex];
  if (!bar) return null;
  const prev = bars[dayIndex - 1] || bar;
  const [date, open, high, low, close, volume] = bar;
  const prevClose = prev[4];
  return {
    symbol,
    date,
    open,
    high,
    low,
    last: close,
    prevClose,
    volume,
    changePct: prevClose ? ((close - prevClose) / prevClose) * 100 : 0,
    bid: Math.max(0.01, Math.round((close - 0.01) * 100) / 100),
    ask: Math.round((close + 0.01) * 100) / 100,
  };
}

export function quotesAt(dataset, dayIndex) {
  const map = {};
  for (const ticker of dataset.tickers) {
    map[ticker.symbol] = quoteAt(dataset, ticker.symbol, dayIndex);
  }
  return map;
}

export function advanceRun(run, dataset, days = 1) {
  const maxIndex = barCount(dataset) - 1;
  const nextIndex = Math.min(maxIndex, run.dayIndex + days);
  return {
    ...run,
    dayIndex: nextIndex,
    reachedEnd: nextIndex >= maxIndex,
  };
}

export function advanceToNextEvent(run, dataset, scenario) {
  const date = currentDate(dataset, run.dayIndex);
  const bars = dataset.tickers[0].bars;
  const next = scenario.events.find((event) => event.date > date);
  if (!next) return { ...run, reachedEnd: run.dayIndex >= barCount(dataset) - 1 };
  let index = bars.findIndex((bar) => bar[0] >= next.date);
  if (index < 0) index = barCount(dataset) - 1;
  return { ...run, dayIndex: Math.max(run.dayIndex, index), reachedEnd: index >= barCount(dataset) - 1 };
}

export function tradeAtClose(run, dataset, { symbol, side, qty }) {
  const quote = quoteAt(dataset, symbol, run.dayIndex);
  const ticker = tickerData(dataset, symbol);
  if (!quote || !ticker) return { ok: false, error: 'error.unknownTicker' };
  if (ticker.benchmark) return { ok: false, error: 'error.benchmarkNotTradable' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };

  const result = side === 'buy'
    ? buy(run.account, { ticker: symbol, qty: quantity, price: quote.last, fee: HISTORY_FEE, day: run.dayIndex, tick: 0 })
    : sell(run.account, { ticker: symbol, qty: quantity, price: quote.last, fee: HISTORY_FEE, day: run.dayIndex, tick: 0 });

  if (!result.ok) return result;
  return {
    ok: true,
    run: { ...run, account: result.account },
    trade: result.trade,
  };
}

export function summary(run, dataset) {
  const quotes = quotesAt(dataset, run.dayIndex);
  const total = equity(run.account, quotes);
  const pnl = total - run.account.initialCash;
  const unrealized = unrealizedPnl(run.account, quotes);
  const rows = positionRows(run.account, quotes).map((row) => ({
    ...row,
    name: tickerData(dataset, row.ticker)?.name || row.ticker,
  }));
  const benchmark = dataset.tickers.find((ticker) => ticker.benchmark);
  const startIndex = Math.max(1, Number(run.startIndex) || 1);
  const startBar = benchmark?.bars?.[startIndex] || benchmark?.bars?.[0];
  const currentBar = benchmark?.bars?.[run.dayIndex];
  const benchmarkReturn = startBar && currentBar ? ((currentBar[4] - startBar[4]) / startBar[4]) * 100 : 0;
  return {
    total,
    cash: run.account.cash,
    holdings: marketValue(run.account, quotes),
    unrealized,
    realized: run.account.realizedPnl,
    fees: run.account.feesPaid,
    rows,
    pnl,
    returnPct: returnPct(run.account, quotes),
    benchmarkReturn,
    dayIndex: run.dayIndex,
    startIndex,
    date: currentDate(dataset, run.dayIndex),
    totalDays: barCount(dataset),
    reachedEnd: run.dayIndex >= barCount(dataset) - 1,
  };
}

export function localeDateText(dateText, locale) {
  if (!dateText) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${dateText}T00:00:00Z`));
  } catch {
    return dateText;
  }
}
