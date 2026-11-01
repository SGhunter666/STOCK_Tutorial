/**
 * Deterministic stock market simulation.
 *
 * Price drivers per tick:
 *   beta * market factor + sector factor + company specific noise + slow cycle
 * plus one-off shocks from news events. The engine is DOM free and fully serializable.
 */
import { createRng } from '../core/rng.js';
import { COMPANIES, SECTORS, getCompany } from '../data/companies.js';
import { TICKS_PER_DAY } from './calendar.js';

export const HISTORY_DAYS = 90;
const HISTORY_LIMIT = 220;

const COMPANY_EVENTS = [
  { template: 'earningsBeat', min: 3, max: 8 },
  { template: 'earningsMiss', min: -8, max: -3 },
  { template: 'contractWin', min: 2, max: 6 },
  { template: 'lawsuit', min: -7, max: -2 },
  { template: 'ceoExit', min: -5, max: -2 },
  { template: 'recall', min: -6, max: -3 },
  { template: 'upgrade', min: 1, max: 4 },
  { template: 'downgrade', min: -4, max: -1 },
];

const MACRO_EVENTS = [
  { template: 'rateCut', min: 1, max: 3 },
  { template: 'rateHike', min: -3, max: -1 },
  { template: 'inflationCool', min: 1, max: 2.5 },
  { template: 'inflationHot', min: -2.5, max: -1 },
  { template: 'growthStrong', min: 1, max: 2.5 },
  { template: 'recessionFear', min: -2.5, max: -1 },
];

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function clampPrice(v) {
  return Math.max(0.5, round2(v));
}

function newQuote(company, last) {
  const half = Math.max(0.01, Math.round(last * 0.0004 * 100) / 100);
  return {
    ticker: company.ticker,
    last,
    prevClose: last,
    open: last,
    high: last,
    low: last,
    volume: 0,
    bid: round2(Math.max(0.01, last - half)),
    ask: round2(last + half),
    changePct: 0,
    marketCap: round2(last * company.sharesOutstanding),
  };
}

function buildHistory(company, rng) {
  const candles = [];
  let price = company.startPrice;
  let prevClose = price;
  for (let i = 0; i < HISTORY_DAYS; i += 1) {
    const d = i - HISTORY_DAYS;
    const drift = 0.0004 + Math.sin(i / 14) * 0.0006;
    const ret = drift + company.dailyVol * 0.55 * rng.normal();
    const open = round2(prevClose);
    price = Math.max(1, open * Math.exp(ret));
    const high = round2(Math.max(open, price) * (1 + Math.abs(rng.normal()) * 0.006));
    const low = round2(Math.min(open, price) * (1 - Math.abs(rng.normal()) * 0.006));
    candles.push({
      d,
      o: open,
      h: high,
      l: low,
      c: round2(price),
      v: Math.round(company.avgVolume * rng.range(0.6, 1.4)),
    });
    prevClose = price;
  }
  // Scale the series so the most recent close equals the designed start price.
  const factor = company.startPrice / candles[candles.length - 1].c;
  for (const candle of candles) {
    candle.o = round2(candle.o * factor);
    candle.h = round2(candle.h * factor);
    candle.l = round2(candle.l * factor);
    candle.c = round2(candle.c * factor);
  }
  return candles;
}

export class MarketEngine {
  constructor(state) {
    this.state = state;
    this.rng = createRng(state.seed);
    if (state.rngState) this.rng.setState(state.rngState);
    if (!state.etfDivisors) state.etfDivisors = {};
    this._ensureEtfQuotes();
    this._syncEtfDivisors();
  }

  /**
   * Keeps one divisor per ETF so its quote is a fixed multiple of the weighted
   * component basket. Existing divisors are preserved across reloads, otherwise
   * every load would reset the fund back to its launch price.
   */
  _syncEtfDivisors() {
    const st = this.state;
    for (const etf of COMPANIES.filter((company) => company.isEtf)) {
      if (st.etfDivisors[etf.ticker]) continue;
      const quote = st.quotes[etf.ticker];
      if (!quote) continue;
      const basket = etf.components.reduce((sum, component) => (
        sum + component.weight * (st.quotes[component.ticker] ? st.quotes[component.ticker].last : 0)
      ), 0);
      st.etfDivisors[etf.ticker] = basket > 0 ? quote.last / basket : 1;
    }
  }

  /** Adds ETF quotes/history when loading an older save that predates the products. */
  _ensureEtfQuotes() {
    const st = this.state;
    for (const etf of COMPANIES.filter((company) => company.isEtf)) {
      if (st.quotes[etf.ticker] && st.history[etf.ticker]) continue;
      const components = etf.components.map((component) => ({
        weight: component.weight,
        series: st.history[component.ticker] || [],
      }));
      if (!components.length || components.some((component) => !component.series.length)) continue;
      const length = Math.min(90, ...components.map((component) => component.series.length));
      const candles = [];
      for (let index = 0; index < length; index += 1) {
        const at = (series) => series[series.length - length + index];
        const value = components.reduce((sum, component) => sum + component.weight * at(component.series).c, 0);
        const previous = index > 0
          ? components.reduce((sum, component) => (
            sum + component.weight * component.series[component.series.length - length + index - 1].c
          ), 0)
          : value;
        candles.push({
          d: at(components[0].series).d,
          o: round2(previous),
          h: round2(Math.max(previous, value) * 1.003),
          l: round2(Math.min(previous, value) * 0.997),
          c: round2(value),
          v: etf.avgVolume,
        });
      }
      const factor = etf.startPrice / candles[candles.length - 1].c;
      for (const candle of candles) {
        candle.o = round2(candle.o * factor);
        candle.h = round2(candle.h * factor);
        candle.l = round2(candle.l * factor);
        candle.c = round2(candle.c * factor);
      }
      st.history[etf.ticker] = candles;
      const lastClose = candles[candles.length - 1].c;
      const quote = newQuote(etf, lastClose);
      quote.prevClose = candles[candles.length - 2].c;
      quote.changePct = ((lastClose - quote.prevClose) / quote.prevClose) * 100;
      st.quotes[etf.ticker] = quote;
    }
  }

  static create(seed = 'academy-2026', initialCapitalUnused = 0) {
    const rng = createRng(seed);
    const history = {};
    const quotes = {};
    let baseCap = 0;
    let currentCap = 0;

    for (const company of COMPANIES) {
      if (company.isEtf) continue;
      const candles = buildHistory(company, rng);
      history[company.ticker] = candles;
      const lastClose = candles[candles.length - 1].c;
      const quote = newQuote(company, lastClose);
      quote.prevClose = candles[candles.length - 2].c;
      quote.changePct = ((lastClose - quote.prevClose) / quote.prevClose) * 100;
      quotes[company.ticker] = quote;
      baseCap += candles[0].c * company.sharesOutstanding;
      currentCap += quote.last * company.sharesOutstanding;
    }

    const etfDivisors = {};
    for (const etf of COMPANIES.filter((company) => company.isEtf)) {
      const componentHistory = etf.components.map((component) => ({
        weight: component.weight,
        candles: history[component.ticker],
      }));
      const candles = [];
      for (let index = 0; index < HISTORY_DAYS; index += 1) {
        const value = componentHistory.reduce((sum, component) => (
          sum + component.weight * component.candles[index].c
        ), 0);
        const previous = index > 0
          ? componentHistory.reduce((sum, component) => (
            sum + component.weight * component.candles[index - 1].c
          ), 0)
          : value;
        candles.push({
          d: index - HISTORY_DAYS,
          o: round2(previous),
          h: round2(Math.max(previous, value) * 1.003),
          l: round2(Math.min(previous, value) * 0.997),
          c: round2(value),
          v: Math.round(etf.avgVolume * rng.range(0.6, 1.4)),
        });
      }
      const factor = etf.startPrice / candles[candles.length - 1].c;
      for (const candle of candles) {
        candle.o = round2(candle.o * factor);
        candle.h = round2(candle.h * factor);
        candle.l = round2(candle.l * factor);
        candle.c = round2(candle.c * factor);
      }
      history[etf.ticker] = candles;
      const lastClose = candles[candles.length - 1].c;
      const quote = newQuote(etf, lastClose);
      quote.prevClose = candles[candles.length - 2].c;
      quote.changePct = ((lastClose - quote.prevClose) / quote.prevClose) * 100;
      quotes[etf.ticker] = quote;
      const basket = etf.components.reduce((sum, component) => (
        sum + component.weight * quotes[component.ticker].last
      ), 0);
      etfDivisors[etf.ticker] = basket > 0 ? etf.startPrice / basket : 1;
    }

    const indexHistory = [];
    const indexValue = (currentCap / baseCap) * 1000;
    indexHistory.push({ d: -1, v: round2(indexValue) });

    const state = {
      seed,
      rngState: rng.getState(),
      day: 0,
      tick: 0,
      quotes,
      history,
      etfDivisors,
      index: {
        baseCap,
        value: round2(indexValue),
        prevClose: round2(indexValue),
        history: indexHistory,
      },
      news: [
        { id: 1, day: -2, tick: 0, kind: 'company', template: 'earningsBeat', ticker: 'AURA', pct: 5.2 },
        { id: 2, day: -1, tick: 0, kind: 'macro', template: 'rateCut', ticker: null, pct: 2.1 },
      ],
      newsSeq: 3,
      macroDrift: 0,
    };

    return new MarketEngine(state);
  }

  /**
   * Saves created before the universe expansion only contain the core segment.
   * Generate the missing companies (history + quotes) so progress can be preserved.
   */
  ensureUniverse() {
    const st = this.state;
    let changed = false;
    for (const company of COMPANIES) {
      if (company.isEtf) continue;
      if (st.history[company.ticker] && st.quotes[company.ticker]) continue;
      const candles = buildHistory(company, this.rng);
      st.history[company.ticker] = candles;
      const lastClose = candles[candles.length - 1].c;
      const quote = newQuote(company, lastClose);
      quote.prevClose = candles[candles.length - 2].c;
      quote.changePct = ((lastClose - quote.prevClose) / quote.prevClose) * 100;
      st.quotes[company.ticker] = quote;
      changed = true;
    }
    this._ensureEtfQuotes();
    this._syncEtfDivisors();
    if (!changed) {
      st.rngState = this.rng.getState();
      return false;
    }

    let baseCap = 0;
    for (const company of COMPANIES) {
      if (company.isEtf) continue;
      const candles = st.history[company.ticker];
      if (candles && candles.length) baseCap += candles[0].c * company.sharesOutstanding;
      const quote = st.quotes[company.ticker];
      if (quote && !Number.isFinite(quote.prevClose)) quote.prevClose = quote.last;
    }
    st.index.baseCap = baseCap || st.index.baseCap;
    this._recomputeIndex();
    st.rngState = this.rng.getState();
    return true;
  }

  getQuote(ticker) {
    return this.state.quotes[ticker] || null;
  }

  getIndex() {
    return this.state.index;
  }

  getCandles(ticker, limit = 60) {
    const candles = this.state.history[ticker] || [];
    return limit ? candles.slice(-limit) : candles;
  }

  recentNews(limit = 20) {
    return this.state.news.slice(-limit).reverse();
  }

  _recomputeIndex() {
    let cap = 0;
    for (const company of COMPANIES) {
      if (company.isEtf) continue;
      const q = this.state.quotes[company.ticker];
      cap += q.last * company.sharesOutstanding;
    }
    this.state.index.value = round2((cap / this.state.index.baseCap) * 1000);
  }

  _refreshQuoteDerived(company) {
    const q = this.state.quotes[company.ticker];
    const half = Math.max(0.01, Math.round(q.last * 0.0004 * 100) / 100);
    q.bid = round2(Math.max(0.01, q.last - half));
    q.ask = round2(q.last + half);
    q.changePct = q.prevClose ? ((q.last - q.prevClose) / q.prevClose) * 100 : 0;
    q.marketCap = round2(q.last * company.sharesOutstanding);
  }

  /** Advance a single simulation tick. */
  tick() {
    const st = this.state;
    const rng = this.rng;

    const cycle = Math.sin((st.day + st.tick / TICKS_PER_DAY) / 16) * 0.0005;
    const marketRet = 0.00015 + cycle + rng.normal() * 0.0045;
    st.macroDrift = marketRet;

    const sectorRet = {};
    for (const sector of SECTORS) {
      sectorRet[sector] = rng.normal() * 0.003;
    }

    for (const company of COMPANIES) {
      if (company.isEtf) continue;
      const q = st.quotes[company.ticker];
      const idio = company.dailyVol / Math.sqrt(TICKS_PER_DAY);
      const ret = company.beta * marketRet + sectorRet[company.sector] + rng.normal() * idio;
      q.last = clampPrice(q.last * Math.exp(ret));
      q.high = Math.max(q.high, q.last);
      q.low = Math.min(q.low, q.last);
      q.volume += Math.round(company.avgVolume * rng.range(0.05, 0.2) * (1 + Math.abs(ret) * 20));
      this._refreshQuoteDerived(company);
    }

    for (const etf of COMPANIES.filter((company) => company.isEtf)) {
      const q = st.quotes[etf.ticker];
      const basket = etf.components.reduce((sum, component) => (
        sum + component.weight * st.quotes[component.ticker].last
      ), 0);
      q.last = clampPrice(basket * (st.etfDivisors[etf.ticker] || 1));
      q.high = Math.max(q.high, q.last);
      q.low = Math.min(q.low, q.last);
      q.volume += Math.round(etf.avgVolume * rng.range(0.05, 0.2));
      this._refreshQuoteDerived(etf);
    }

    this._recomputeIndex();
    st.tick += 1;
    st.rngState = rng.getState();

    let dayClosed = false;
    if (st.tick >= TICKS_PER_DAY) {
      dayClosed = true;
      this._closeDay();
    }

    return { dayClosed };
  }

  _closeDay() {
    const st = this.state;
    for (const company of COMPANIES) {
      const q = st.quotes[company.ticker];
      const series = st.history[company.ticker];
      series.push({
        d: st.day,
        o: q.open,
        h: Math.max(q.high, q.last),
        l: Math.min(q.low, q.last),
        c: q.last,
        v: q.volume,
      });
      if (series.length > HISTORY_LIMIT) series.splice(0, series.length - HISTORY_LIMIT);
      q.prevClose = q.last;
      q.open = q.last;
      q.high = q.last;
      q.low = q.last;
      q.volume = 0;
      this._refreshQuoteDerived(company);
    }

    st.index.history.push({ d: st.day, v: st.index.value });
    if (st.index.history.length > HISTORY_LIMIT) {
      st.index.history.splice(0, st.index.history.length - HISTORY_LIMIT);
    }
    st.index.prevClose = st.index.value;
    st.day += 1;
    st.tick = 0;
    st.rngState = this.rng.getState();

    this._maybeEmitNews();
  }

  _applyShock(ticker, pct) {
    const company = getCompany(ticker);
    if (!company || company.isEtf) return;
    const q = this.state.quotes[ticker];
    q.last = clampPrice(q.last * (1 + pct / 100));
    q.high = Math.max(q.high, q.last);
    q.low = Math.min(q.low, q.last);
    this._refreshQuoteDerived(company);
  }

  _pushNews(entry) {
    this.state.news.push({ id: this.state.newsSeq++, ...entry });
    if (this.state.news.length > 80) this.state.news.shift();
  }

  _maybeEmitNews() {
    const rng = this.rng;
    const st = this.state;

    if (rng.next() < 0.22) {
      const kind = rng.pick(MACRO_EVENTS);
      const pct = rng.range(kind.min, kind.max);
      for (const company of COMPANIES.filter((entry) => !entry.isEtf)) {
        this._applyShock(company.ticker, pct * Math.max(0.5, company.beta));
      }
      this._pushNews({
        day: st.day,
        tick: 0,
        kind: 'macro',
        template: kind.template,
        ticker: null,
        pct: Math.round(pct * 10) / 10,
      });
    }

    if (rng.next() < 0.5) {
      const count = rng.next() < 0.18 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const company = rng.pick(COMPANIES.filter((entry) => !entry.isEtf));
        const kind = rng.pick(COMPANY_EVENTS);
        const pct = rng.range(kind.min, kind.max);
        this._applyShock(company.ticker, pct);
        this._pushNews({
          day: st.day,
          tick: 0,
          kind: 'company',
          template: kind.template,
          ticker: company.ticker,
          pct: Math.round(pct * 10) / 10,
        });
      }
    }

    this._recomputeIndex();
    st.rngState = rng.getState();
  }

  /** Advance until the current session closes (used by the "next day" button). */
  fastForwardDay() {
    const startDay = this.state.day;
    let guard = 0;
    while (this.state.day === startDay && guard < TICKS_PER_DAY * 4) {
      this.tick();
      guard += 1;
    }
    return { closedDay: this.state.day };
  }

  serialize() {
    return this.state;
  }
}
