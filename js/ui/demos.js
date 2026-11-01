/**
 * Interactive teaching demonstrations. Every demo keeps its own local state and
 * never touches the player's simulated account.
 */
import { money, num, pct, signedMoney } from '../core/format.js';
import { LineChart, CandlestickChart } from './chart.js';
import { createRng } from '../core/rng.js';
import { companyName } from './labels.js';
import { unlockedCompanies } from '../market/marketAccess.js';
import { STOCK_STYLES, styleOf, styleLabelKey, styleDescKey } from '../data/stockTypes.js';
import { sma, rsi } from '../market/indicators.js';
import { financialsFor } from '../data/financials.js';
import { dcf } from '../education/valuation.js';
import { macroSnapshot, regimeKey } from '../market/macro.js';
import { buildOrderBook, estimateMarketFill } from '../market/orderBook.js';

function demoShell(title, desc, body) {
  return `
    <div class="demo">
      <header class="demo__head">
        <span class="demo__badge">LAB</span>
        <div>
          <h4 class="demo__title">${title}</h4>
          <p class="demo__desc">${desc}</p>
        </div>
      </header>
      <div class="demo__body">${body}</div>
    </div>`;
}

function demoNote(text) {
  return `<p class="demo__note">${text}</p>`;
}

function mountMarketCap(node, ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let ticker = 'AURA';
  let price = Math.round((store.get().market.quotes[ticker].last || 42.5) * 100) / 100;

  function availableCompanies() {
    return unlockedCompanies(store.get());
  }

  function compareList(quotes) {
    const list = [...availableCompanies()]
      .sort((a, b) => b.sharesOutstanding * quotes[b.ticker].last - a.sharesOutstanding * quotes[a.ticker].last)
      .slice(0, 10);
    if (!list.some((c) => c.ticker === ticker)) {
      const selected = availableCompanies().find((c) => c.ticker === ticker);
      if (selected) list.push(selected);
    }
    return list;
  }

  function render() {
    const companies = availableCompanies();
    const company = companies.find((c) => c.ticker === ticker) || companies[0];
    ticker = company.ticker;
    const quotes = store.get().market.quotes;
    const cap = company.sharesOutstanding * price;
    const maxCap = Math.max(...companies.map((c) => c.sharesOutstanding * quotes[c.ticker].last));
    node.innerHTML = demoShell(
      t('demo.marketCap.title'),
      t('demo.marketCap.desc'),
      `
        <div class="demo-controls">
          <label class="field">
            <span class="field-label">${t('demo.marketCap.company')}</span>
            <select class="input" id="mc-company">
              ${companies.map((c) => `<option value="${c.ticker}" ${c.ticker === ticker ? 'selected' : ''}>${c.ticker} · ${companyName(ctx, c.ticker)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="field-label">${t('demo.marketCap.price')}</span>
            <input class="input input--range" id="mc-price" type="range" min="${(company.startPrice * 0.5).toFixed(1)}" max="${(company.startPrice * 1.6).toFixed(1)}" step="0.5" value="${price}">
            <span class="range-value" id="mc-price-value">${money(price, i18n.locale)}</span>
          </label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result">
            <span>${t('demo.marketCap.price')}</span>
            <strong id="mc-price-out">${money(price, i18n.locale)}</strong>
          </div>
          <div class="demo-result">
            <span>${t('demo.marketCap.shares')}</span>
            <strong>${num(company.sharesOutstanding / 1e6, i18n.locale, 0)}M</strong>
          </div>
          <div class="demo-result demo-result--accent">
            <span>${t('demo.marketCap.cap')}</span>
            <strong id="mc-cap">${money(cap, i18n.locale, 0)}</strong>
          </div>
        </div>
        <div class="demo-bars">
          <span class="field-label">${t('demo.marketCap.compare')}</span>
          ${compareList(quotes).map((c) => {
            const q = quotes[c.ticker];
            const companyCap = c.sharesOutstanding * q.last;
            const width = Math.max(4, (companyCap / maxCap) * 100);
            return `<div class="demo-bar ${c.ticker === ticker ? 'is-active' : ''}" data-pick="${c.ticker}">
              <span class="demo-bar__label">${c.ticker}</span>
              <span class="demo-bar__track"><span class="demo-bar__fill" style="width:${width}%"></span></span>
              <span class="demo-bar__value">${money(companyCap, i18n.locale, 0)}</span>
            </div>`;
          }).join('')}
        </div>
        ${demoNote(t('demo.common.note'))}`,
    );

    node.querySelector('#mc-company')?.addEventListener('change', (event) => {
      ticker = event.target.value;
      const next = availableCompanies().find((c) => c.ticker === ticker);
      price = Math.round(store.get().market.quotes[ticker].last * 100) / 100;
      render();
      const slider = node.querySelector('#mc-price');
      if (slider && next) {
        slider.min = (next.startPrice * 0.5).toFixed(1);
        slider.max = (next.startPrice * 1.6).toFixed(1);
        slider.value = price;
      }
    });
    node.querySelector('#mc-price')?.addEventListener('input', (event) => {
      price = Number(event.target.value);
      const companyNow = availableCompanies().find((c) => c.ticker === ticker) || company;
      const capNow = companyNow.sharesOutstanding * price;
      const outPrice = node.querySelector('#mc-price-out');
      const outPriceValue = node.querySelector('#mc-price-value');
      const outCap = node.querySelector('#mc-cap');
      if (outPrice) outPrice.textContent = money(price, i18n.locale);
      if (outPriceValue) outPriceValue.textContent = money(price, i18n.locale);
      if (outCap) outCap.textContent = money(capNow, i18n.locale, 0);
    });
    node.querySelectorAll('[data-pick]').forEach((bar) => {
      bar.addEventListener('click', () => {
        ticker = bar.dataset.pick;
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountSpread(node, ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let qty = 100;

  function render() {
    const quote = store.get().market.quotes.AURA;
    const bid = quote.bid;
    const ask = quote.ask;
    const spread = Math.round((ask - bid) * 100) / 100;
    const cost = spread * qty;
    const askPos = 88;
    node.innerHTML = demoShell(
      t('demo.spread.title'),
      t('demo.spread.desc'),
      `
        <div class="spread-visual">
          <div class="spread-visual__labels"><span>${t('demo.spread.bid')} ${money(bid, i18n.locale)}</span><span>${t('demo.spread.ask')} ${money(ask, i18n.locale)}</span></div>
          <div class="spread-visual__bar">
            <span class="spread-visual__zone" style="left:0;width:${askPos}%"></span>
            <span class="spread-visual__spread" style="left:${askPos}%;width:${100 - askPos}%"></span>
            <span class="spread-visual__marker" style="left:${askPos}%"></span>
          </div>
          <div class="spread-visual__hint">${t('demo.spread.hint')}</div>
        </div>
        <label class="field field--inline">
          <span class="field-label">${t('demo.spread.qty')}</span>
          <input class="input" id="spread-qty" type="range" min="1" max="1000" step="1" value="${qty}">
          <span class="range-value" id="spread-qty-value">${num(qty, i18n.locale, 0)}</span>
        </label>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.spread.spread')}</span><strong>${money(spread, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.spread.roundTrip')}</span><strong>${money(spread * qty, i18n.locale)}</strong></div>
          <div class="demo-result demo-result--down"><span>${t('demo.spread.pctCost')}</span><strong>${pct((spread / quote.last) * 100, i18n.locale, 3, false)}</strong></div>
        </div>
        ${demoNote(t('demo.common.note'))}`,
    );
    node.querySelector('#spread-qty')?.addEventListener('input', (event) => {
      qty = Number(event.target.value);
      const spreadNow = Math.round((quote.ask - quote.bid) * 100) / 100;
      const costNode = node.querySelector('.demo-result:nth-child(2) strong');
      const qtyNode = node.querySelector('#spread-qty-value');
      if (qtyNode) qtyNode.textContent = num(qty, i18n.locale, 0);
      if (costNode) costNode.textContent = money(spreadNow * qty, i18n.locale);
    });
  }

  render();
  return () => {};
}

function mountPnl(node, ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let buy = 50;
  let sell = 55;
  let qty = 100;
  const fee = 1;
  let chart = null;

  function calc() {
    const invested = buy * qty + fee;
    const proceeds = sell * qty - fee;
    const net = proceeds - invested;
    const ret = invested ? (net / invested) * 100 : 0;
    return { invested, proceeds, net, ret };
  }

  function render() {
    const result = calc();
    const sellMin = Math.round(buy * 0.8 * 100) / 100;
    const sellMax = Math.round(buy * 1.25 * 100) / 100;
    if (sell < sellMin) sell = sellMin;
    if (sell > sellMax) sell = sellMax;
    node.innerHTML = demoShell(
      t('demo.pnl.title'),
      t('demo.pnl.desc'),
      `
        <div class="demo-controls">
          <label class="field">
            <span class="field-label">${t('demo.pnl.buyPrice')}</span>
            <input class="input" id="pnl-buy" type="number" min="1" step="0.5" value="${buy}">
          </label>
          <label class="field">
            <span class="field-label">${t('demo.pnl.qty')}</span>
            <input class="input" id="pnl-qty" type="number" min="1" step="1" value="${qty}">
          </label>
          <label class="field field--wide">
            <span class="field-label">${t('demo.pnl.sellPrice')} <span class="range-value" id="pnl-sell-label">${money(sell, i18n.locale)}</span></span>
            <input class="input input--range" id="pnl-sell" type="range" min="${sellMin}" max="${sellMax}" step="0.01" value="${sell}">
          </label>
        </div>
        <div class="demo-result-grid demo-result-grid--four">
          <div class="demo-result"><span>${t('demo.pnl.invested')}</span><strong id="pnl-invested">${money(result.invested, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.pnl.proceeds')}</span><strong id="pnl-proceeds">${money(result.proceeds, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.pnl.fees')}</span><strong>${money(fee * 2, i18n.locale)}</strong></div>
          <div class="demo-result ${result.net > 0 ? 'demo-result--up' : result.net < 0 ? 'demo-result--down' : ''}">
            <span>${t('demo.pnl.net')}</span><strong id="pnl-net">${money(result.net, i18n.locale)}</strong>
          </div>
        </div>
        <div class="demo-return" id="pnl-return">${t('demo.pnl.returnLine', { pct: pct(result.ret, i18n.locale, 2) })}</div>
        <div class="demo-chart">
          <div class="demo-chart__head">
            <span class="field-label">${t('demo.pnl.chartTitle')}</span>
            <span class="muted" id="pnl-chart-note">${t('demo.pnl.chartNote')}</span>
          </div>
          <canvas id="pnl-chart" style="height:180px"></canvas>
        </div>
        ${demoNote(t('demo.common.note'))}`,
    );

    const canvas = node.querySelector('#pnl-chart');
    if (chart) chart.destroy();
    chart = new LineChart(canvas, {
      height: 180,
      yFormat: (value) => money(value, i18n.locale, 0),
      color: '#5eead4',
      markers: [{ value: 0, label: t('demo.pnl.breakeven'), color: 'rgba(245,183,80,0.9)' }],
    });

    function updateCurve() {
      const points = [];
      const steps = 40;
      const low = Math.round(buy * 0.8 * 100) / 100;
      const high = Math.round(buy * 1.25 * 100) / 100;
      for (let i = 0; i <= steps; i += 1) {
        const price = low + ((high - low) * i) / steps;
        points.push(price * qty - fee - (buy * qty + fee));
      }
      chart.setData({ values: points, labels: [] });
    }
    updateCurve();

    node.querySelector('#pnl-buy')?.addEventListener('input', (event) => {
      buy = Math.max(1, Number(event.target.value) || 1);
      render();
    });
    node.querySelector('#pnl-qty')?.addEventListener('change', (event) => {
      qty = Math.max(1, Math.floor(Number(event.target.value) || 1));
      render();
    });
    node.querySelector('#pnl-sell')?.addEventListener('input', (event) => {
      sell = Number(event.target.value);
      const next = calc();
      const investedNode = node.querySelector('#pnl-invested');
      const proceedsNode = node.querySelector('#pnl-proceeds');
      const netNode = node.querySelector('#pnl-net');
      const returnNode = node.querySelector('#pnl-return');
      const labelNode = node.querySelector('#pnl-sell-label');
      if (investedNode) investedNode.textContent = money(next.invested, i18n.locale);
      if (proceedsNode) proceedsNode.textContent = money(next.proceeds, i18n.locale);
      if (netNode) netNode.textContent = money(next.net, i18n.locale);
      if (returnNode) returnNode.textContent = t('demo.pnl.returnLine', { pct: pct(next.ret, i18n.locale, 2) });
      if (labelNode) labelNode.textContent = money(sell, i18n.locale);
      updateCurve();
    });
  }

  render();
  return () => {
    if (chart) chart.destroy();
  };
}

function mountLimitOrder(node, ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const quote = store.get().market.quotes.AURA;
  let limit = Math.round(quote.last * 0.97 * 100) / 100;
  let qty = 20;
  let chart = null;
  let runId = 0;

  function render() {
    node.innerHTML = demoShell(
      t('demo.limitOrder.title'),
      t('demo.limitOrder.desc'),
      `
        <div class="demo-controls">
          <label class="field">
            <span class="field-label">${t('demo.limitOrder.current')}</span>
            <span class="demo-static">${money(quote.last, i18n.locale)}</span>
          </label>
          <label class="field">
            <span class="field-label">${t('demo.limitOrder.limit')}</span>
            <input class="input" id="lo-limit" type="number" min="0.5" step="0.01" value="${limit}">
          </label>
          <label class="field">
            <span class="field-label">${t('demo.limitOrder.qty')}</span>
            <input class="input" id="lo-qty" type="number" min="1" step="1" value="${qty}">
          </label>
        </div>
        <div class="demo-actions">
          <button class="btn btn--primary btn--sm" type="button" id="lo-run">${t('demo.limitOrder.simulate')}</button>
          <span class="muted">${t('demo.limitOrder.hint')}</span>
        </div>
        <div class="demo-chart">
          <canvas id="lo-chart" style="height:190px"></canvas>
        </div>
        <div class="demo-verdict" id="lo-verdict">${t('demo.limitOrder.idle')}</div>
        ${demoNote(t('demo.common.note'))}`,
    );

    const canvas = node.querySelector('#lo-chart');
    if (chart) chart.destroy();
    chart = new LineChart(canvas, {
      height: 190,
      yFormat: (value) => money(value, i18n.locale),
      color: '#7c9cff',
      markers: [{ value: limit, label: t('demo.limitOrder.limitLabel'), color: 'rgba(245,183,80,0.9)' }],
    });
    chart.setData({ values: [quote.last, quote.last] });
    chart.render();

    node.querySelector('#lo-limit')?.addEventListener('change', (event) => {
      limit = Math.max(0.5, Number(event.target.value) || 0.5);
      chart.options.markers = [{ value: limit, label: t('demo.limitOrder.limitLabel'), color: 'rgba(245,183,80,0.9)' }];
      chart.render();
      const verdict = node.querySelector('#lo-verdict');
      if (verdict) verdict.textContent = t('demo.limitOrder.idle');
    });
    node.querySelector('#lo-qty')?.addEventListener('change', (event) => {
      qty = Math.max(1, Math.floor(Number(event.target.value) || 1));
    });

    node.querySelector('#lo-run')?.addEventListener('click', () => {
      runId += 1;
      const rng = createRng(`limit-demo-${Date.now()}-${runId}`);
      const path = [quote.last];
      let filledAt = null;
      const total = 24;
      for (let i = 1; i <= total; i += 1) {
        const prev = path[i - 1];
        const next = prev * Math.exp(rng.normal() * 0.006);
        path.push(Math.max(0.5, Math.round(next * 100) / 100));
        if (filledAt === null && path[i] <= limit) filledAt = i;
      }
      chart.options.markers = [{ value: limit, label: t('demo.limitOrder.limitLabel'), color: 'rgba(245,183,80,0.9)' }];
      chart.setData({ values: path });
      const verdict = node.querySelector('#lo-verdict');
      if (verdict) {
        verdict.className = `demo-verdict ${filledAt !== null ? 'is-filled' : 'is-resting'}`;
        verdict.textContent = filledAt !== null
          ? t('demo.limitOrder.filled', { tick: filledAt, price: money(limit, i18n.locale) })
          : t('demo.limitOrder.notFilled', { ticks: total });
      }
    });
  }

  render();
  return () => {
    if (chart) chart.destroy();
  };
}

function mountDividend(node, ctx) {
  const { i18n } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let shares = 100;
  let price = 40;
  let yieldPct = 3;

  function calc() {
    const annualPerShare = price * (yieldPct / 100);
    const annual = shares * annualPerShare;
    const quarterly = annual / 4;
    const futureShares = shares * ((1 + yieldPct / 100) ** 10);
    const futureIncome = futureShares * annualPerShare;
    return {
      annualPerShare, annual, quarterly, futureIncome,
      yieldOnCost: yieldPct,
    };
  }

  function render() {
    const result = calc();
    node.innerHTML = demoShell(
      t('demo.dividend.title'),
      t('demo.dividend.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.dividend.shares')}</span>
            <input class="input" id="dv-shares" type="number" min="1" step="1" value="${shares}">
          </label>
          <label class="demo-field"><span class="field-label">${t('demo.dividend.price')}</span>
            <input class="input" id="dv-price" type="number" min="1" step="0.01" value="${price}">
          </label>
          <label class="demo-field"><span class="field-label">${t('demo.dividend.yield')}</span>
            <input class="input" id="dv-yield" type="number" min="0" max="15" step="0.1" value="${yieldPct}">
          </label>
        </div>
        <div class="demo-result-grid" id="dv-result">
          <div class="demo-result"><span>${t('demo.dividend.perShare')}</span><strong>${money(result.annualPerShare, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.dividend.annual')}</span><strong>${money(result.annual, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.dividend.quarterly')}</span><strong>${money(result.quarterly, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.dividend.tenYear')}</span><strong>${money(result.futureIncome, i18n.locale)}</strong></div>
        </div>
        ${demoNote(t('demo.dividend.note'))}`,
    );

    const update = () => {
      const resultNode = node.querySelector('#dv-result');
      if (!resultNode) return;
      resultNode.innerHTML = `
        <div class="demo-result"><span>${t('demo.dividend.perShare')}</span><strong>${money(calc().annualPerShare, i18n.locale)}</strong></div>
        <div class="demo-result"><span>${t('demo.dividend.annual')}</span><strong>${money(calc().annual, i18n.locale)}</strong></div>
        <div class="demo-result"><span>${t('demo.dividend.quarterly')}</span><strong>${money(calc().quarterly, i18n.locale)}</strong></div>
        <div class="demo-result"><span>${t('demo.dividend.tenYear')}</span><strong>${money(calc().futureIncome, i18n.locale)}</strong></div>`;
    };
    node.querySelector('#dv-shares')?.addEventListener('change', (event) => {
      shares = Math.max(1, Math.floor(Number(event.target.value) || 1));
      update();
    });
    node.querySelector('#dv-price')?.addEventListener('change', (event) => {
      price = Math.max(1, Number(event.target.value) || 1);
      update();
    });
    node.querySelector('#dv-yield')?.addEventListener('change', (event) => {
      yieldPct = Math.min(15, Math.max(0, Number(event.target.value) || 0));
      update();
    });
  }

  render();
  return () => {};
}

function mountStyle(node, ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const companies = unlockedCompanies(store.get()).slice(0, 12);
  let ticker = companies[0]?.ticker || 'AURA';

  function detail() {
    const company = companies.find((entry) => entry.ticker === ticker) || companies[0];
    if (!company) return null;
    const style = styleOf(company.ticker);
    return {
      company,
      style,
      styleLabel: style ? t(styleLabelKey(style)) : '—',
      styleDesc: style ? t(styleDescKey(style)) : '',
      sector: t(`sector.${company.sector}`),
      yieldText: company.dividendYield
        ? `${company.dividendYield.toFixed(2)}%`
        : t('demo.stockStyle.noDividend'),
    };
  }

  function render() {
    node.innerHTML = demoShell(
      t('demo.stockStyle.title'),
      t('demo.stockStyle.desc'),
      `
        <label class="demo-field"><span class="field-label">${t('demo.stockStyle.company')}</span>
          <select class="input" id="ss-company">
            ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === ticker ? 'selected' : ''}>${company.ticker} · ${companyName(ctx, company.ticker)}</option>`).join('')}
          </select>
        </label>
        <div class="demo-result-grid" id="ss-result"></div>
        <div class="demo-note" id="ss-desc"></div>`,
    );
    paint();
    node.querySelector('#ss-company')?.addEventListener('change', (event) => {
      ticker = event.target.value;
      paint();
    });
  }

  function paint() {
    const data = detail();
    if (!data) return;
    const resultNode = node.querySelector('#ss-result');
    if (resultNode) {
      resultNode.innerHTML = `
        <div class="demo-result"><span>${t('demo.stockStyle.style')}</span><strong>${data.styleLabel}</strong></div>
        <div class="demo-result"><span>${t('demo.stockStyle.sector')}</span><strong>${data.sector}</strong></div>
        <div class="demo-result"><span>${t('demo.stockStyle.yield')}</span><strong>${data.yieldText}</strong></div>`;
    }
    const descNode = node.querySelector('#ss-desc');
    if (descNode) descNode.textContent = data.styleDesc;
  }

  render();
  return () => {};
}

function mountDiversification(node, ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const state = store.get();
  const picks = ['AURA', 'VRDN', 'ORBT'];
  const windowDays = 60;

  function returns(series) {
    const values = series.slice(-windowDays).map((candle) => candle.c);
    const result = [];
    for (let index = 1; index < values.length; index += 1) {
      result.push((values[index] - values[index - 1]) / values[index - 1]);
    }
    return result;
  }

  function volatility(values) {
    if (!values.length) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  function basketPath() {
    const series = picks.map((ticker) => state.market.history[ticker]?.slice(-windowDays).map((candle) => candle.c) || []);
    const length = Math.min(...series.map((entry) => entry.length));
    if (!length) return { path: [], singleVol: 0, basketVol: 0 };
    const normalized = series.map((entry) => entry.slice(0, length).map((value) => value / entry[0]));
    const path = [];
    for (let index = 0; index < length; index += 1) {
      path.push(normalized.reduce((sum, entry) => sum + entry[index], 0) / normalized.length * 100);
    }
    const basketReturns = [];
    for (let index = 1; index < path.length; index += 1) {
      basketReturns.push((path[index] - path[index - 1]) / path[index - 1]);
    }
    return {
      path,
      singleVol: volatility(returns(state.market.history[picks[0]] || [])),
      basketVol: volatility(basketReturns),
    };
  }

  const data = basketPath();
  node.innerHTML = demoShell(
    t('demo.diversification.title'),
    t('demo.diversification.desc'),
    `
      <div class="demo-result-grid">
        <div class="demo-result"><span>${t('demo.diversification.basket')}</span><strong>${picks.join(' · ')}</strong></div>
        <div class="demo-result"><span>${t('demo.diversification.singleVol')}</span><strong>${pct(data.singleVol, i18n.locale, 1, false)}</strong></div>
        <div class="demo-result"><span>${t('demo.diversification.basketVol')}</span><strong>${pct(data.basketVol, i18n.locale, 1, false)}</strong></div>
      </div>
      <div class="chart-wrap"><canvas id="dv-basket-chart" style="height:190px"></canvas></div>
      ${demoNote(t('demo.diversification.note'))}`,
  );

  const chart = new LineChart(node.querySelector('#dv-basket-chart'), {
    height: 190,
    color: '#5eead4',
    yFormat: (value) => num(value, i18n.locale, 1),
  });
  chart.setData({
    values: data.path,
    labels: [t('demo.diversification.start'), t('common.today')],
  });
  return () => chart.destroy();
}

function mountCompounding(node, ctx) {
  const { i18n } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let initial = 1000;
  let monthly = 100;
  let rate = 7;
  let years = 20;

  function projection() {
    const monthlyRate = (rate / 100) / 12;
    const months = years * 12;
    const path = [];
    let balance = initial;
    let contributed = initial;
    for (let month = 0; month <= months; month += 1) {
      if (month > 0) {
        balance = balance * (1 + monthlyRate) + monthly;
        contributed += monthly;
      }
      if (month % 12 === 0) path.push(balance);
    }
    return { balance, contributed, growth: balance - contributed, path };
  }

  function render() {
    const data = projection();
    node.innerHTML = demoShell(
      t('demo.compounding.title'),
      t('demo.compounding.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.compounding.initial')}</span>
            <input class="input" id="cp-initial" type="number" min="0" step="100" value="${initial}">
          </label>
          <label class="demo-field"><span class="field-label">${t('demo.compounding.monthly')}</span>
            <input class="input" id="cp-monthly" type="number" min="0" step="10" value="${monthly}">
          </label>
          <label class="demo-field"><span class="field-label">${t('demo.compounding.rate')}</span>
            <input class="input" id="cp-rate" type="number" min="0" max="20" step="0.5" value="${rate}">
          </label>
          <label class="demo-field"><span class="field-label">${t('demo.compounding.years')}</span>
            <input class="input" id="cp-years" type="number" min="1" max="50" step="1" value="${years}">
          </label>
        </div>
        <div class="demo-result-grid" id="cp-result">
          <div class="demo-result"><span>${t('demo.compounding.final')}</span><strong>${money(data.balance, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.compounding.contributed')}</span><strong>${money(data.contributed, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.compounding.growth')}</span><strong>${money(data.growth, i18n.locale)}</strong></div>
        </div>
        <div class="chart-wrap"><canvas id="cp-chart" style="height:200px"></canvas></div>
        ${demoNote(t('demo.compounding.note'))}`,
    );

    const chart = new LineChart(node.querySelector('#cp-chart'), {
      height: 200,
      color: '#5eead4',
      yFormat: (value) => money(value, i18n.locale),
      padding: { top: 14, right: 12, bottom: 20, left: 80 },
    });
    chart.setData({
      values: data.path,
      labels: [t('demo.compounding.start'), t('demo.compounding.end', { years })],
    });

    const update = () => {
      initial = Math.max(0, Number(node.querySelector('#cp-initial').value) || 0);
      monthly = Math.max(0, Number(node.querySelector('#cp-monthly').value) || 0);
      rate = Math.min(20, Math.max(0, Number(node.querySelector('#cp-rate').value) || 0));
      years = Math.min(50, Math.max(1, Math.floor(Number(node.querySelector('#cp-years').value) || 1)));
      const next = projection();
      const resultNode = node.querySelector('#cp-result');
      if (resultNode) {
        resultNode.innerHTML = `
          <div class="demo-result"><span>${t('demo.compounding.final')}</span><strong>${money(next.balance, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.compounding.contributed')}</span><strong>${money(next.contributed, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.compounding.growth')}</span><strong>${money(next.growth, i18n.locale)}</strong></div>`;
      }
      chart.setData({
        values: next.path,
        labels: [t('demo.compounding.start'), t('demo.compounding.end', { years })],
      });
    };
    ['#cp-initial', '#cp-monthly', '#cp-rate', '#cp-years'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', update);
    });
    return () => chart.destroy();
  }

  return render();
}

function mountCandle(node, ctx) {
  const { i18n, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let open = 48.0;
  let high = 52.0;
  let low = 46.5;
  let close = 51.2;

  function paint() {
    const chart = new CandlestickChart(node.querySelector('#cd-chart'), {
      height: 220,
      showVolume: false,
      yFormat: (value) => money(value, i18n.locale),
    });
    chart.setData({
      candles: [{ o: open, h: high, l: low, c: close }],
      labels: [t('demo.candle.session')],
    });
    return chart;
  }

  node.innerHTML = demoShell(
    t('demo.candle.title'),
    t('demo.candle.desc'),
    `
      <div class="demo-inputs">
        <label class="demo-field"><span class="field-label">${t('demo.candle.open')}</span><input class="input" id="cd-open" type="number" step="0.1" value="${open}"></label>
        <label class="demo-field"><span class="field-label">${t('demo.candle.high')}</span><input class="input" id="cd-high" type="number" step="0.1" value="${high}"></label>
        <label class="demo-field"><span class="field-label">${t('demo.candle.low')}</span><input class="input" id="cd-low" type="number" step="0.1" value="${low}"></label>
        <label class="demo-field"><span class="field-label">${t('demo.candle.close')}</span><input class="input" id="cd-close" type="number" step="0.1" value="${close}"></label>
      </div>
      <div class="demo-result-grid" id="cd-verdict"></div>
      <div class="chart-wrap"><canvas id="cd-chart" style="height:220px"></canvas></div>
      ${demoNote(t('demo.candle.note'))}`,
  );

  let chart = paint();

  function verdict() {
    const up = close >= open;
    const body = Math.abs(close - open);
    const range = high - low;
    return `
      <div class="demo-result"><span>${t('demo.candle.type')}</span><strong>${up ? t('demo.candle.bull') : t('demo.candle.bear')}</strong></div>
      <div class="demo-result"><span>${t('demo.candle.body')}</span><strong>${money(body, i18n.locale)}</strong></div>
      <div class="demo-result"><span>${t('demo.candle.range')}</span><strong>${money(range, i18n.locale)}</strong></div>`;
  }

  node.querySelector('#cd-verdict').innerHTML = verdict();

  const read = () => {
    open = Number(node.querySelector('#cd-open').value) || open;
    high = Number(node.querySelector('#cd-high').value) || open;
    low = Number(node.querySelector('#cd-low').value) || open;
    close = Number(node.querySelector('#cd-close').value) || open;
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    chart.destroy();
    chart = paint();
    node.querySelector('#cd-verdict').innerHTML = verdict();
    if (actions && actions.completeDemo) actions.completeDemo('candle');
  };
  ['#cd-open', '#cd-high', '#cd-low', '#cd-close'].forEach((id) => {
    node.querySelector(id)?.addEventListener('change', read);
  });

  return () => chart.destroy();
}

function mountIndicators(node, ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const companies = unlockedCompanies(store.get()).slice(0, 15);
  let ticker = companies[0]?.ticker || 'AURA';
  let chart = null;

  function snapshot() {
    const state = store.get();
    const history = state.market.history[ticker] || [];
    const quote = state.market.quotes[ticker];
    const closes = [...history.slice(-60).map((candle) => candle.c)];
    if (quote) closes.push(quote.last);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);
    const sma20Series = closes.map((_, index) => (index >= 19 ? sma(closes.slice(0, index + 1), 20) : null));
    const sma50Series = closes.map((_, index) => (index >= 49 ? sma(closes.slice(0, index + 1), 50) : null));
    return { closes, sma20, sma50, rsi14, sma20Series, sma50Series };
  }

  function render() {
    const data = snapshot();
    node.innerHTML = demoShell(
      t('demo.indicators.title'),
      t('demo.indicators.desc'),
      `
        <label class="demo-field"><span class="field-label">${t('demo.indicators.company')}</span>
          <select class="input" id="ind-company">
            ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === ticker ? 'selected' : ''}>${company.ticker} · ${companyName(ctx, company.ticker)}</option>`).join('')}
          </select>
        </label>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.indicators.sma20')}</span><strong>${data.sma20 ? money(data.sma20, i18n.locale) : '—'}</strong></div>
          <div class="demo-result"><span>${t('demo.indicators.sma50')}</span><strong>${data.sma50 ? money(data.sma50, i18n.locale) : '—'}</strong></div>
          <div class="demo-result"><span>${t('demo.indicators.rsi')}</span><strong>${data.rsi14 ? num(data.rsi14, i18n.locale, 1) : '—'}</strong></div>
        </div>
        <p class="demo-note">${data.sma20 && data.sma50
          ? (data.sma20 > data.sma50 ? t('demo.indicators.golden') : t('demo.indicators.death'))
          : t('demo.indicators.notEnough')}</p>
        <div class="chart-wrap"><canvas id="ind-chart" style="height:220px"></canvas></div>
        ${demoNote(t('demo.indicators.note'))}`,
    );

    if (chart) chart.destroy();
    chart = new LineChart(node.querySelector('#ind-chart'), {
      height: 220,
      color: '#5eead4',
      yFormat: (value) => money(value, i18n.locale),
      overlays: [
        { values: data.sma20Series, color: '#7c9cff' },
        { values: data.sma50Series, color: 'rgba(245,183,80,0.9)' },
      ],
    });
    chart.setData({ values: data.closes, labels: [t('demo.indicators.start'), t('common.today')] });

    node.querySelector('#ind-company')?.addEventListener('change', (event) => {
      ticker = event.target.value;
      if (actions && actions.completeDemo) actions.completeDemo('indicators');
      render();
    });
  }

  render();
  return () => {
    if (chart) chart.destroy();
  };
}

function mountFinancials(node, ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const companies = unlockedCompanies(store.get()).slice(0, 15);
  let ticker = companies[0]?.ticker || 'AURA';

  function render() {
    const company = companies.find((entry) => entry.ticker === ticker) || companies[0];
    const f = financialsFor(company);
    node.innerHTML = demoShell(
      t('demo.financials.title'),
      t('demo.financials.desc'),
      `
        <label class="demo-field"><span class="field-label">${t('demo.financials.company')}</span>
          <select class="input" id="fin-company">
            ${companies.map((entry) => `<option value="${entry.ticker}" ${entry.ticker === ticker ? 'selected' : ''}>${entry.ticker} · ${companyName(ctx, entry.ticker)}</option>`).join('')}
          </select>
        </label>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.financials.revenue')}</span><strong>${money(f.revenue / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.grossProfit')}</span><strong>${money(f.grossProfit / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.netIncome')}</span><strong>${money(f.netIncome / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.assets')}</span><strong>${money(f.assets / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.liabilities')}</span><strong>${money(f.liabilities / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.equity')}</span><strong>${money(f.equity / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.cash')}</span><strong>${money(f.cash / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.debt')}</span><strong>${money(f.debt / 1e6, i18n.locale)}M</strong></div>
          <div class="demo-result"><span>${t('demo.financials.fcf')}</span><strong>${money(f.freeCashFlow / 1e6, i18n.locale)}M</strong></div>
        </div>
        ${demoNote(t('demo.financials.note'))}`,
    );
    node.querySelector('#fin-company')?.addEventListener('change', (event) => {
      ticker = event.target.value;
      if (actions && actions.completeDemo) actions.completeDemo('financials');
      render();
    });
  }

  render();
  return () => {};
}

function mountDcf(node, ctx) {
  const { i18n, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let fcf = 500;
  let growth = 6;
  let years = 5;
  let discount = 9;
  let terminal = 2.5;
  let shares = 100;
  let netDebt = 200;

  function render() {
    const result = dcf({ fcf, growthRate: growth, years, discountRate: discount, terminalGrowth: terminal, shares, netDebt });
    node.innerHTML = demoShell(
      t('demo.dcf.title'),
      t('demo.dcf.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.dcf.fcf')}</span><input class="input" id="dcf-fcf" type="number" min="1" step="10" value="${fcf}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.dcf.growth')}</span><input class="input" id="dcf-growth" type="number" min="0" max="30" step="0.5" value="${growth}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.dcf.years')}</span><input class="input" id="dcf-years" type="number" min="1" max="15" step="1" value="${years}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.dcf.discount')}</span><input class="input" id="dcf-discount" type="number" min="1" max="25" step="0.5" value="${discount}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.dcf.terminal')}</span><input class="input" id="dcf-terminal" type="number" min="0" max="8" step="0.1" value="${terminal}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.dcf.shares')}</span><input class="input" id="dcf-shares" type="number" min="1" step="1" value="${shares}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.dcf.netDebt')}</span><input class="input" id="dcf-netdebt" type="number" step="10" value="${netDebt}"></label>
        </div>
        <div class="demo-result-grid" id="dcf-result">
          ${result ? `
            <div class="demo-result"><span>${t('demo.dcf.enterprise')}</span><strong>${money(result.enterpriseValue, i18n.locale)}M</strong></div>
            <div class="demo-result"><span>${t('demo.dcf.equity')}</span><strong>${money(result.equityValue, i18n.locale)}M</strong></div>
            <div class="demo-result"><span>${t('demo.dcf.perShare')}</span><strong>${money(result.perShare, i18n.locale)}</strong></div>
            <div class="demo-result"><span>${t('demo.dcf.terminalShare')}</span><strong>${pct(result.terminalShare, i18n.locale, 1, false)}</strong></div>`
            : `<p class="inline-warning">${t('demo.dcf.invalid')}</p>`}
        </div>
        ${demoNote(t('demo.dcf.note'))}`,
    );
    ['#dcf-fcf', '#dcf-growth', '#dcf-years', '#dcf-discount', '#dcf-terminal', '#dcf-shares', '#dcf-netdebt'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        fcf = Number(node.querySelector('#dcf-fcf').value) || fcf;
        growth = Number(node.querySelector('#dcf-growth').value) || 0;
        years = Math.max(1, Math.min(15, Number(node.querySelector('#dcf-years').value) || 5));
        discount = Number(node.querySelector('#dcf-discount').value) || 9;
        terminal = Number(node.querySelector('#dcf-terminal').value) || 0;
        shares = Math.max(1, Number(node.querySelector('#dcf-shares').value) || 1);
        netDebt = Number(node.querySelector('#dcf-netdebt').value) || 0;
        if (actions && actions.completeDemo) actions.completeDemo('dcf');
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountMacro(node, ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const base = macroSnapshot(store.get().market.day, store.get().seed);
  let rate = base.policyRate;
  let inflation = base.inflation;
  let growth = base.growth;

  function render() {
    const realRate = Math.round((rate - inflation) * 10) / 10;
    const regime = growth >= 2.6 ? 'expansion' : growth <= 1.2 ? 'slowdown' : inflation >= 3.2 ? 'inflation' : 'neutral';
    node.innerHTML = demoShell(
      t('demo.macro.title'),
      t('demo.macro.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.macro.rate')}</span><input class="input" id="mac-rate" type="number" min="0" max="12" step="0.1" value="${rate}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.macro.inflation')}</span><input class="input" id="mac-inflation" type="number" min="-2" max="12" step="0.1" value="${inflation}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.macro.growth')}</span><input class="input" id="mac-growth" type="number" min="-4" max="8" step="0.1" value="${growth}"></label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.macro.realRate')}</span><strong>${num(realRate, i18n.locale, 1)}%</strong></div>
          <div class="demo-result"><span>${t('demo.macro.regime')}</span><strong>${t(regimeKey(regime))}</strong></div>
          <div class="demo-result"><span>${t('demo.macro.discount')}</span><strong>${num(rate + 5, i18n.locale, 1)}%</strong></div>
        </div>
        ${demoNote(t('demo.macro.note'))}`,
    );
    ['#mac-rate', '#mac-inflation', '#mac-growth'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        rate = Number(node.querySelector('#mac-rate').value) || 0;
        inflation = Number(node.querySelector('#mac-inflation').value) || 0;
        growth = Number(node.querySelector('#mac-growth').value) || 0;
        if (actions && actions.completeDemo) actions.completeDemo('macro');
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountAllocation(node, ctx) {
  const { i18n, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let stock = 60;
  let bond = 30;

  function render() {
    const cash = Math.max(0, 100 - stock - bond);
    const total = stock + bond + cash;
    const weights = total > 0 ? [stock / total, bond / total, cash / total] : [0, 0, 0];
    const expected = weights[0] * 7 + weights[1] * 3.5 + weights[2] * 1.5;
    const volatility = weights[0] * 16 + weights[1] * 6 + weights[2] * 0.5;
    node.innerHTML = demoShell(
      t('demo.allocation.title'),
      t('demo.allocation.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.allocation.stocks')}</span><input class="input" id="al-stock" type="number" min="0" max="100" step="5" value="${stock}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.allocation.bonds')}</span><input class="input" id="al-bond" type="number" min="0" max="100" step="5" value="${bond}"></label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.allocation.stockWeight')}</span><strong>${num(weights[0] * 100, i18n.locale, 0)}%</strong></div>
          <div class="demo-result"><span>${t('demo.allocation.bondWeight')}</span><strong>${num(weights[1] * 100, i18n.locale, 0)}%</strong></div>
          <div class="demo-result"><span>${t('demo.allocation.cashWeight')}</span><strong>${num(weights[2] * 100, i18n.locale, 0)}%</strong></div>
          <div class="demo-result"><span>${t('demo.allocation.expected')}</span><strong>${num(expected, i18n.locale, 1)}%</strong></div>
          <div class="demo-result"><span>${t('demo.allocation.volatility')}</span><strong>${num(volatility, i18n.locale, 1)}%</strong></div>
        </div>
        ${demoNote(t('demo.allocation.note'))}`,
    );
    ['#al-stock', '#al-bond'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        stock = Math.max(0, Math.min(100, Number(node.querySelector('#al-stock').value) || 0));
        bond = Math.max(0, Math.min(100, Number(node.querySelector('#al-bond').value) || 0));
        if (actions && actions.completeDemo) actions.completeDemo('allocation');
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountRisk(node, ctx) {
  const { i18n, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let accountSize = 10000;
  let riskPct = 1;
  let entry = 40;
  let stop = 36;

  function render() {
    const riskAmount = accountSize * (riskPct / 100);
    const perShare = Math.max(0.01, entry - stop);
    const shares = Math.max(0, Math.floor(riskAmount / perShare));
    const position = shares * entry;
    const exposure = accountSize > 0 ? position / accountSize * 100 : 0;
    node.innerHTML = demoShell(
      t('demo.risk.title'),
      t('demo.risk.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.risk.account')}</span><input class="input" id="rk-account" type="number" min="100" step="100" value="${accountSize}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.risk.riskPct')}</span><input class="input" id="rk-risk" type="number" min="0.1" max="10" step="0.1" value="${riskPct}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.risk.entry')}</span><input class="input" id="rk-entry" type="number" min="1" step="0.5" value="${entry}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.risk.stop')}</span><input class="input" id="rk-stop" type="number" min="0.5" step="0.5" value="${stop}"></label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.risk.riskAmount')}</span><strong>${money(riskAmount, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.risk.perShare')}</span><strong>${money(perShare, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.risk.shares')}</span><strong>${num(shares, i18n.locale, 0)}</strong></div>
          <div class="demo-result"><span>${t('demo.risk.position')}</span><strong>${money(position, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.risk.exposure')}</span><strong>${num(exposure, i18n.locale, 1)}%</strong></div>
        </div>
        ${demoNote(t('demo.risk.note'))}`,
    );
    ['#rk-account', '#rk-risk', '#rk-entry', '#rk-stop'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        accountSize = Math.max(100, Number(node.querySelector('#rk-account').value) || accountSize);
        riskPct = Math.max(0.1, Math.min(10, Number(node.querySelector('#rk-risk').value) || riskPct));
        entry = Math.max(1, Number(node.querySelector('#rk-entry').value) || entry);
        stop = Math.max(0.5, Number(node.querySelector('#rk-stop').value) || stop);
        if (stop >= entry) stop = entry * 0.9;
        if (actions && actions.completeDemo) actions.completeDemo('risk');
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountStrategies(node, ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const state = store.get();
  let horizon = 60;

  function basketReturn(style) {
    const tickers = STOCK_STYLES[style] || [];
    const series = tickers
      .map((ticker) => state.market.history[ticker] || [])
      .filter((entry) => entry.length > horizon)
      .map((entry) => entry.slice(-horizon).map((candle) => candle.c));
    if (!series.length) return null;
    const normalized = series.map((entry) => entry.map((value) => value / entry[0]));
    const path = [];
    for (let index = 0; index < horizon; index += 1) {
      path.push(normalized.reduce((sum, entry) => sum + entry[index], 0) / normalized.length);
    }
    return (path[path.length - 1] - 1) * 100;
  }

  function render() {
    const rows = ['growth', 'value', 'dividend', 'cyclical'].map((style) => ({ style, value: basketReturn(style) }));
    node.innerHTML = demoShell(
      t('demo.strategies.title'),
      t('demo.strategies.desc'),
      `
        <label class="demo-field"><span class="field-label">${t('demo.strategies.horizon')}</span>
          <select class="input" id="st-horizon">
            ${[30, 60, 90].map((days) => `<option value="${days}" ${days === horizon ? 'selected' : ''}>${t('demo.strategies.sessions', { days })}</option>`).join('')}
          </select>
        </label>
        <div class="demo-result-grid">
          ${rows.map((row) => `<div class="demo-result"><span>${t(styleLabelKey(row.style))}</span><strong class="${row.value > 0 ? 'up' : row.value < 0 ? 'down' : ''}">${row.value === null ? '—' : `${row.value > 0 ? '+' : ''}${num(row.value, i18n.locale, 2)}%`}</strong></div>`).join('')}
        </div>
        ${demoNote(t('demo.strategies.note'))}`,
    );
    node.querySelector('#st-horizon')?.addEventListener('change', (event) => {
      horizon = Number(event.target.value) || 60;
      if (actions && actions.completeDemo) actions.completeDemo('strategies');
      render();
    });
  }

  render();
  return () => {};
}

function mountShortPnl(node, ctx) {
  const { i18n } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let entry = 50;
  let exit = 40;
  let shares = 100;

  function render() {
    const proceeds = entry * shares;
    const coverCost = exit * shares;
    const pnl = proceeds - coverCost;
    const returnPct = proceeds > 0 ? (pnl / proceeds) * 100 : 0;
    const collateral = proceeds * 0.5;
    node.innerHTML = demoShell(
      t('demo.shortPnl.title'),
      t('demo.shortPnl.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.shortPnl.entry')}</span><input class="input" id="sp-entry" type="number" min="1" step="0.5" value="${entry}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.shortPnl.exit')}</span><input class="input" id="sp-exit" type="number" min="0.5" step="0.5" value="${exit}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.shortPnl.shares')}</span><input class="input" id="sp-shares" type="number" min="1" step="1" value="${shares}"></label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.shortPnl.proceeds')}</span><strong>${money(proceeds, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.shortPnl.coverCost')}</span><strong>${money(coverCost, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.shortPnl.pnl')}</span><strong class="${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}">${signedMoney(pnl, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.shortPnl.return')}</span><strong>${pct(returnPct, i18n.locale, 2)}</strong></div>
          <div class="demo-result"><span>${t('demo.shortPnl.collateral')}</span><strong>${money(collateral, i18n.locale)}</strong></div>
        </div>
        ${demoNote(t('demo.shortPnl.note'))}`,
    );
    ['#sp-entry', '#sp-exit', '#sp-shares'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        entry = Math.max(1, Number(node.querySelector('#sp-entry').value) || entry);
        exit = Math.max(0.5, Number(node.querySelector('#sp-exit').value) || exit);
        shares = Math.max(1, Math.floor(Number(node.querySelector('#sp-shares').value) || shares));
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountMargin(node, ctx) {
  const { i18n, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let cash = 10000;
  let price = 50;
  let shares = 300;

  function render() {
    const value = price * shares;
    const loan = Math.max(0, value - cash);
    const equity = value - loan;
    const leverage = cash > 0 ? value / cash : 0;
    const interest = loan * 0.08 / 252;
    node.innerHTML = demoShell(
      t('demo.margin.title'),
      t('demo.margin.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.margin.cash')}</span><input class="input" id="mg-cash" type="number" min="100" step="100" value="${cash}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.margin.price')}</span><input class="input" id="mg-price" type="number" min="1" step="0.5" value="${price}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.margin.shares')}</span><input class="input" id="mg-shares" type="number" min="1" step="1" value="${shares}"></label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.margin.value')}</span><strong>${money(value, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.margin.loan')}</span><strong>${money(loan, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.margin.equity')}</span><strong>${money(equity, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.margin.leverage')}</span><strong>${num(leverage, i18n.locale, 2)}×</strong></div>
          <div class="demo-result"><span>${t('demo.margin.interest')}</span><strong>${money(interest, i18n.locale)}</strong></div>
        </div>
        ${demoNote(t('demo.margin.note'))}`,
    );
    ['#mg-cash', '#mg-price', '#mg-shares'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        cash = Math.max(100, Number(node.querySelector('#mg-cash').value) || cash);
        price = Math.max(1, Number(node.querySelector('#mg-price').value) || price);
        shares = Math.max(1, Math.floor(Number(node.querySelector('#mg-shares').value) || shares));
        if (actions && actions.completeDemo) actions.completeDemo('margin');
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountStopOrder(node, ctx) {
  const { i18n } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let entry = 100;
  let stop = 92;
  let trail = 6;
  let shares = 100;

  function render() {
    const perShare = entry - stop;
    const risk = perShare * shares;
    const distance = entry > 0 ? (perShare / entry) * 100 : 0;
    const trailingStop = entry - trail;
    node.innerHTML = demoShell(
      t('demo.stopOrder.title'),
      t('demo.stopOrder.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.stopOrder.entry')}</span><input class="input" id="so-entry" type="number" min="1" step="0.5" value="${entry}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.stopOrder.stop')}</span><input class="input" id="so-stop" type="number" min="0.1" step="0.5" value="${stop}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.stopOrder.trail')}</span><input class="input" id="so-trail" type="number" min="0.5" step="0.5" value="${trail}"></label>
          <label class="demo-field"><span class="field-label">${t('demo.stopOrder.shares')}</span><input class="input" id="so-shares" type="number" min="1" step="1" value="${shares}"></label>
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.stopOrder.perShare')}</span><strong>${money(perShare, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.stopOrder.distance')}</span><strong>${pct(distance, i18n.locale, 1, false)}</strong></div>
          <div class="demo-result"><span>${t('demo.stopOrder.risk')}</span><strong>${money(risk, i18n.locale)}</strong></div>
          <div class="demo-result"><span>${t('demo.stopOrder.trailing')}</span><strong>${money(trailingStop, i18n.locale)}</strong></div>
        </div>
        ${demoNote(t('demo.stopOrder.note'))}`,
    );
    ['#so-entry', '#so-stop', '#so-trail', '#so-shares'].forEach((id) => {
      node.querySelector(id)?.addEventListener('change', () => {
        entry = Math.max(1, Number(node.querySelector('#so-entry').value) || entry);
        stop = Math.max(0.1, Number(node.querySelector('#so-stop').value) || stop);
        trail = Math.max(0.5, Number(node.querySelector('#so-trail').value) || trail);
        shares = Math.max(1, Math.floor(Number(node.querySelector('#so-shares').value) || shares));
        if (stop >= entry) stop = entry * 0.9;
        render();
      });
    });
  }

  render();
  return () => {};
}

function mountOrderBook(node, ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const companies = unlockedCompanies(store.get());
  let ticker = companies[0] ? companies[0].ticker : 'AURA';
  let qty = 500;

  function render() {
    const quote = store.get().market.quotes[ticker];
    const book = buildOrderBook(quote, { levels: 5 });
    const fill = estimateMarketFill(book, 'buy', qty);
    const rows = [
      ...book.asks.slice().reverse().map((level) => ({ ...level, side: 'ask' })),
      ...book.bids.map((level) => ({ ...level, side: 'bid' })),
    ];
    node.innerHTML = demoShell(
      t('demo.orderBook.title'),
      t('demo.orderBook.desc'),
      `
        <div class="demo-inputs">
          <label class="demo-field"><span class="field-label">${t('demo.orderBook.ticker')}</span>
            <select class="input" id="ob-ticker">
              ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === ticker ? 'selected' : ''}>${company.ticker}</option>`).join('')}
            </select>
          </label>
          <label class="demo-field"><span class="field-label">${t('demo.orderBook.qty')}</span><input class="input" id="ob-qty" type="number" min="1" step="50" value="${qty}"></label>
        </div>
        <div class="demo-book">
          ${rows.map((row) => `<div class="demo-book__row demo-book__row--${row.side}"><span>${row.side === 'ask' ? t('demo.orderBook.ask') : t('demo.orderBook.bid')}</span><strong>${money(row.price, i18n.locale)}</strong><span>${num(row.size, i18n.locale, 0)}</span></div>`).join('')}
        </div>
        <div class="demo-result-grid">
          <div class="demo-result"><span>${t('demo.orderBook.avgPrice')}</span><strong>${fill.filledQty ? money(fill.avgPrice, i18n.locale) : '—'}</strong></div>
          <div class="demo-result"><span>${t('demo.orderBook.slippage')}</span><strong>${pct(fill.slippagePct, i18n.locale, 2, false)}</strong></div>
          <div class="demo-result"><span>${t('demo.orderBook.filled')}</span><strong>${num(fill.filledQty, i18n.locale, 0)} / ${num(qty, i18n.locale, 0)}</strong></div>
        </div>
        ${demoNote(t('demo.orderBook.note'))}`,
    );
    node.querySelector('#ob-ticker')?.addEventListener('change', (event) => {
      ticker = event.target.value;
      if (actions && actions.completeDemo) actions.completeDemo('orderBook');
      render();
    });
    node.querySelector('#ob-qty')?.addEventListener('change', () => {
      qty = Math.max(1, Math.floor(Number(node.querySelector('#ob-qty').value) || qty));
      if (actions && actions.completeDemo) actions.completeDemo('orderBook');
      render();
    });
  }

  render();
  return () => {};
}

const DEMOS = {
  marketCap: mountMarketCap,
  spread: mountSpread,
  pnl: mountPnl,
  limitOrder: mountLimitOrder,
  dividend: mountDividend,
  stockStyle: mountStyle,
  diversification: mountDiversification,
  compounding: mountCompounding,
  candle: mountCandle,
  indicators: mountIndicators,
  financials: mountFinancials,
  dcf: mountDcf,
  macro: mountMacro,
  allocation: mountAllocation,
  risk: mountRisk,
  strategies: mountStrategies,
  shortPnl: mountShortPnl,
  margin: mountMargin,
  stopOrder: mountStopOrder,
  orderBook: mountOrderBook,
};

export function mountDemo(demoId, node, ctx) {
  const factory = DEMOS[demoId];
  if (!factory) return () => {};
  return factory(node, ctx);
}
