/**
 * Phase 2/3 isolated "Simulated Exchange" view. It runs its own one-second
 * clock and order book and never touches the legacy 8-tick market or real data.
 */
import { pageHead, card, statCard, segmented, table } from '../kit.js';
import { CandlestickChart } from '../chart.js';
import { money, num, pct } from '../../core/format.js';
import { toast } from '../components.js';
import { SIM_COMPANIES } from '../../sim/companies50.js';
import {
  createExchangeEngine, advanceSecond, advanceMinute, getCandles, getBook,
  submitOrder, cancelOrder, equity, positionRows, openOrderRows,
  serializeExchange, deserializeExchange, simClock, simDate,
} from '../../sim/exchangeEngine.js';
import { SimulationClock, SIM_SPEEDS } from '../../sim/simulationClock.js';

const SAVE_KEY = 'sma.sim-exchange-v1';
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserializeExchange(raw) : createExchangeEngine({ seed: 'sim-exchange-v1' });
  } catch (error) {
    console.warn('[exchange] restore failed', error);
    return createExchangeEngine({ seed: 'sim-exchange-v1' });
  }
}

export function createExchangeView(ctx) {
  const { i18n, toast: notify } = ctx;
  let container = null;
  const t = (key, params) => i18n.t(key, params);
  const moneyFmt = (value) => money(value, i18n.locale);
  const numFmt = (value, digits = 0) => num(value, i18n.locale, digits);
  const pctFmt = (value, digits = 2) => pct(value, i18n.locale, digits);
  const toastFn = notify || toast;
  let state = loadState();
  let selected = 'NCRT';
  let timeframe = '5m';
  let chart = null;
  let clock = null;
  let lastPaint = 0;
  let destroyed = false;

  function quote() {
    return state.quotes[selected];
  }

  function chartData() {
    const candles = getCandles(state, selected, timeframe);
    return {
      candles,
      labels: candles.length
        ? [candles[0].d || candles[0].time || '', candles[candles.length - 1].d || candles[candles.length - 1].time || '']
        : [],
    };
  }

  function chartNote() {
    const candles = getCandles(state, selected, timeframe);
    return t('exchange.chartNote', {
      count: candles.length,
      tf: t(`exchange.tf.${timeframe}`),
      time: simClock(state.second),
      date: simDate(state.dayIndex),
    });
  }

  function quoteHtml() {
    const q = quote();
    if (!q) return '';
    return `
      <div class="exchange-quote">
        <div class="exchange-quote__main">
          <span class="pill pill--ok">${t('exchange.simBadge')}</span>
          <strong>${selected}</strong>
          <span class="muted">${state.companies[selected].company.name}</span>
        </div>
        <div class="exchange-quote__price">${moneyFmt(q.last)}</div>
        <div class="delta ${q.changePct > 0 ? 'up' : q.changePct < 0 ? 'down' : 'flat'}">${pctFmt(q.changePct)}</div>
        <div class="exchange-quote__grid">
          <span>${t('exchange.bid')} <strong>${moneyFmt(q.bid)}</strong></span>
          <span>${t('exchange.ask')} <strong>${moneyFmt(q.ask)}</strong></span>
          <span>${t('exchange.volume')} <strong>${numFmt(q.volume)}</strong></span>
          <span>${t('exchange.fairValue')} <strong>${moneyFmt(q.fairValue)}</strong></span>
        </div>
      </div>`;
  }

  function bookHtml() {
    const book = getBook(state, selected, 6);
    const rows = [];
    for (let index = 5; index >= 0; index -= 1) {
      const level = book.asks[index];
      rows.push(level
        ? `<div class="exchange-book__row exchange-book__row--ask"><span>${moneyFmt(level.price)}</span><span>${numFmt(level.size)}</span></div>`
        : '<div class="exchange-book__row exchange-book__row--ask"><span>—</span><span>—</span></div>');
    }
    for (let index = 0; index < 6; index += 1) {
      const level = book.bids[index];
      rows.push(level
        ? `<div class="exchange-book__row exchange-book__row--bid"><span>${moneyFmt(level.price)}</span><span>${numFmt(level.size)}</span></div>`
        : '<div class="exchange-book__row exchange-book__row--bid"><span>—</span><span>—</span></div>');
    }
    return `<div class="exchange-book">
      <div class="exchange-book__head"><span>${t('exchange.price')}</span><span>${t('exchange.size')}</span></div>
      ${rows.join('')}
    </div>`;
  }

  function clockHtml() {
    return `<div class="exchange-clock">
      <span class="status-dot ${clock && clock.running ? 'is-live' : ''}"></span>
      <strong id="sim-clock">${simClock(state.second)}</strong>
      <span class="muted">${simDate(state.dayIndex)} · ${t('exchange.session')}</span>
    </div>`;
  }

  function controlsHtml() {
    return `<div class="exchange-controls">
      <button class="btn btn--primary" type="button" data-sim-play>${clock && clock.running ? t('exchange.pause') : t('exchange.play')}</button>
      ${Object.keys(SIM_SPEEDS).map((speed) => `<button class="speed-btn ${clock && clock.speed === Number(speed) ? 'is-active' : ''}" type="button" data-sim-speed="${speed}">${speed}×</button>`).join('')}
      <button class="btn" type="button" data-sim-step="1">${t('exchange.stepSecond')}</button>
      <button class="btn" type="button" data-sim-step="60">${t('exchange.stepMinute')}</button>
      <button class="btn" type="button" data-sim-save>${t('exchange.save')}</button>
      <button class="btn" type="button" data-sim-reset>${t('exchange.reset')}</button>
    </div>`;
  }

  function ticketHtml() {
    return `<form class="exchange-ticket" data-sim-form>
      <div class="exchange-ticket__row">
        <label>${t('exchange.ticker')}<select class="input input--select" data-sim-ticker>
          ${SIM_COMPANIES.map((company) => `<option value="${company.ticker}" ${company.ticker === selected ? 'selected' : ''}>${company.ticker} · ${company.name}</option>`).join('')}
        </select></label>
        <label>${t('exchange.side')}<select class="input input--select" data-sim-side>
          <option value="buy">${t('exchange.buy')}</option>
          <option value="sell">${t('exchange.sell')}</option>
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.qty')}<input class="input" type="number" min="1" step="1" value="100" data-sim-qty></label>
        <label>${t('exchange.type')}<select class="input input--select" data-sim-type>
          <option value="market">${t('exchange.market')}</option>
          <option value="limit">${t('exchange.limit')}</option>
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.limitPrice')}<input class="input" type="number" min="0.01" step="0.01" data-sim-limit placeholder="${t('exchange.optional')}"></label>
        <button class="btn btn--primary" type="submit">${t('exchange.submit')}</button>
      </div>
      <p class="muted">${t('exchange.ticketNote')}</p>
    </form>`;
  }

  function positionsHtml() {
    const rows = positionRows(state);
    return table({
      head: [t('exchange.ticker'), t('exchange.qty'), t('exchange.avgCost'), t('exchange.last'), t('exchange.marketValue'), t('exchange.unrealized')],
      rows: rows.map((row) => [
        row.ticker,
        numFmt(row.qty),
        moneyFmt(row.avgCost),
        moneyFmt(row.last),
        moneyFmt(row.marketValue),
        moneyFmt(row.unrealized),
      ]),
      empty: t('exchange.empty'),
    });
  }

  function ordersHtml() {
    const rows = openOrderRows(state);
    return table({
      head: [t('exchange.order'), t('exchange.ticker'), t('exchange.side'), t('exchange.type'), t('exchange.qty'), t('exchange.filled'), t('exchange.limitPrice'), ''],
      rows: rows.map((order) => [
        order.id,
        order.ticker,
        order.side,
        order.type,
        numFmt(order.qty),
        numFmt(order.filledQty),
        order.limitPrice === null ? '—' : moneyFmt(order.limitPrice),
        `<button class="link-btn" type="button" data-sim-cancel="${order.id}">${t('exchange.cancel')}</button>`,
      ]),
      empty: t('exchange.empty'),
    });
  }

  function tradesHtml() {
    const trades = state.account.trades.slice(-10).reverse();
    return table({
      head: [t('exchange.time'), t('exchange.ticker'), t('exchange.side'), t('exchange.qty'), t('exchange.price'), t('exchange.fee')],
      rows: trades.map((trade) => [
        `${trade.date} ${trade.time}`,
        trade.ticker,
        trade.side,
        numFmt(trade.qty),
        moneyFmt(trade.price),
        moneyFmt(trade.fee),
      ]),
      empty: t('exchange.empty'),
    });
  }

  function summaryHtml() {
    const total = equity(state);
    return `<div class="exchange-summary">
      ${statCard({ label: t('exchange.equity'), value: moneyFmt(total), tone: total >= state.account.initialCash ? 'up' : 'down' })}
      ${statCard({ label: t('exchange.cash'), value: moneyFmt(state.account.cash) })}
      ${statCard({ label: t('exchange.realized'), value: moneyFmt(state.account.realizedPnl), tone: state.account.realizedPnl >= 0 ? 'up' : 'down' })}
      ${statCard({ label: t('exchange.fees'), value: moneyFmt(state.account.fees) })}
    </div>`;
  }

  function pageHtml() {
    return `
      <div class="exchange-page">
        ${pageHead({
          eyebrow: t('exchange.eyebrow'),
          title: t('exchange.title'),
          subtitle: t('exchange.subtitle'),
          actions: `<span class="pill pill--warn">${t('exchange.simBadge')}</span>`,
        })}
        ${card({
          title: t('exchange.clockTitle'),
          subtitle: t('exchange.clockSubtitle'),
          body: `${clockHtml()}${controlsHtml()}`,
        })}
        <div class="exchange-layout">
          <div class="exchange-main">
            ${card({
              id: 'sim-chart-card',
              title: `${selected} · ${t(`exchange.tf.${timeframe}`)}`,
              subtitle: t('exchange.chartSubtitle'),
              actions: segmented({
                options: TIMEFRAMES.map((value) => ({ value, label: t(`exchange.tf.${value}`) })),
                active: timeframe,
                attr: 'sim-tf',
              }),
              body: `${quoteHtml()}<div class="exchange-chart"><canvas id="sim-chart"></canvas></div><p class="muted" id="sim-chart-note">${chartNote()}</p>`,
            })}
            ${card({ title: t('exchange.positions'), body: `<div id="sim-positions">${positionsHtml()}</div>` })}
            ${card({ title: t('exchange.orders'), body: `<div id="sim-orders">${ordersHtml()}</div>` })}
            ${card({ title: t('exchange.trades'), body: `<div id="sim-trades">${tradesHtml()}</div>` })}
          </div>
          <div class="exchange-side">
            ${card({ title: t('exchange.book'), subtitle: t('exchange.bookSubtitle'), body: `<div id="sim-book">${bookHtml()}</div>` })}
            ${card({ title: t('exchange.ticket'), subtitle: t('exchange.ticketSubtitle'), body: ticketHtml() })}
            <div id="sim-summary">${summaryHtml()}</div>
            <p class="muted">${t('exchange.phaseNote')}</p>
          </div>
        </div>
      </div>`;
  }

  function refreshDynamic() {
    if (destroyed) return;
    const set = (selector, html) => {
      const node = container.querySelector(selector);
      if (node) node.innerHTML = html;
    };
    set('#sim-clock', `${simClock(state.second)}`);
    set('#sim-book', bookHtml());
    set('#sim-positions', positionsHtml());
    set('#sim-orders', ordersHtml());
    set('#sim-trades', tradesHtml());
    set('#sim-summary', summaryHtml());
    const note = container.querySelector('#sim-chart-note');
    if (note) note.textContent = chartNote();
    const quoteNode = container.querySelector('.exchange-quote');
    if (quoteNode) quoteNode.outerHTML = quoteHtml();
    const chartTitle = container.querySelector('#sim-chart-card .card__title');
    if (chartTitle) chartTitle.textContent = `${selected} · ${t(`exchange.tf.${timeframe}`)}`;
    if (chart) chart.setData(chartData());
  }

  function paint(force = false) {
    const now = Date.now();
    if (!force && now - lastPaint < 120) return;
    lastPaint = now;
    refreshDynamic();
  }

  function onSecond() {
    state = advanceSecond(state);
    paint();
  }

  function onMinute() {
    paint(true);
  }

  function setSelected(next) {
    if (!state.companies[next]) return;
    selected = next;
    paint(true);
  }

  function submit(event) {
    event.preventDefault();
    if (clock && clock.running) {
      toastFn(t('exchange.pauseFirst'), 'warn');
      return;
    }
    const form = event.target;
    const side = form.querySelector('[data-sim-side]').value;
    const type = form.querySelector('[data-sim-type]').value;
    const qty = Number(form.querySelector('[data-sim-qty]').value);
    const limitValue = form.querySelector('[data-sim-limit]').value;
    const result = submitOrder(state, {
      ticker: selected,
      side,
      type,
      qty,
      limitPrice: type === 'limit' ? Number(limitValue) : null,
    });
    if (!result.ok) {
      toastFn(t(`exchange.error.${result.error}`), 'error');
      return;
    }
    toastFn(t('exchange.submitted', {
      status: t(`exchange.status.${result.order.status}`),
      filled: result.order.filledQty,
      qty: result.order.qty,
    }), result.order.filledQty ? 'success' : 'info');
    paint(true);
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, serializeExchange(state));
      toastFn(t('exchange.saved'), 'success');
    } catch (error) {
      toastFn(t('exchange.saveFailed'), 'error');
    }
  }

  function reset() {
    if (typeof window !== 'undefined' && window.confirm(t('exchange.resetConfirm'))) {
      state = createExchangeEngine({ seed: 'sim-exchange-v1' });
      selected = 'NCRT';
      timeframe = '5m';
      localStorage.removeItem(SAVE_KEY);
      if (clock) clock.pause();
      mountPage();
      toastFn(t('exchange.resetDone'), 'success');
    }
  }

  function bind() {
    container.addEventListener('click', (event) => {
      const target = event.target.closest('[data-sim-play],[data-sim-speed],[data-sim-step],[data-sim-save],[data-sim-reset],[data-sim-tf],[data-sim-cancel]');
      if (!target) return;
      if (target.matches('[data-sim-play]')) {
        clock.toggle();
        target.textContent = clock.running ? t('exchange.pause') : t('exchange.play');
        const dot = container.querySelector('.exchange-clock .status-dot');
        if (dot) dot.classList.toggle('is-live', clock.running);
        return;
      }
      if (target.matches('[data-sim-speed]')) {
        clock.setSpeed(Number(target.dataset.simSpeed));
        container.querySelectorAll('[data-sim-speed]').forEach((button) => {
          button.classList.toggle('is-active', button === target);
        });
        return;
      }
      if (target.matches('[data-sim-step]')) {
        if (clock.running) clock.pause();
        const count = Number(target.dataset.simStep);
        if (count >= 60) advanceMinute(state);
        else advanceSecond(state);
        paint(true);
        return;
      }
      if (target.matches('[data-sim-save]')) { save(); return; }
      if (target.matches('[data-sim-reset]')) { reset(); return; }
      if (target.matches('[data-sim-tf]')) {
        timeframe = target.dataset.simTf;
        container.querySelectorAll('[data-sim-tf]').forEach((button) => {
          button.classList.toggle('is-active', button === target);
        });
        paint(true);
        return;
      }
      if (target.matches('[data-sim-cancel]')) {
        const result = cancelOrder(state, target.dataset.simCancel);
        if (!result.ok) toastFn(t(`exchange.error.${result.error}`), 'error');
        paint(true);
      }
    });
    container.addEventListener('change', (event) => {
      if (event.target.matches('[data-sim-ticker]')) {
        setSelected(event.target.value);
      }
      if (event.target.matches('[data-sim-type]')) {
        const limit = container.querySelector('[data-sim-limit]');
        if (limit) limit.disabled = event.target.value !== 'limit';
      }
    });
    container.addEventListener('submit', (event) => {
      if (event.target.matches('[data-sim-form]')) submit(event);
    });
  }

  function mountPage() {
    if (chart) chart.destroy();
    chart = null;
    container.innerHTML = pageHtml();
    const canvas = container.querySelector('#sim-chart');
    if (canvas) {
      chart = new CandlestickChart(canvas, {
        showVolume: true,
        yFormat: (value) => money(value, i18n.locale),
      });
      chart.setData(chartData());
    }
    const limit = container.querySelector('[data-sim-limit]');
    if (limit) limit.disabled = true;
  }

  function mount(root) {
    container = root;
    clock = new SimulationClock({
      onSecond,
      onMinute,
      speed: 5,
    });
    clock.pause();
    mountPage();
    bind();
    const play = container.querySelector('[data-sim-play]');
    if (play) play.textContent = t('exchange.play');
  }

  function destroy() {
    destroyed = true;
    if (clock) clock.destroy();
    if (chart) chart.destroy();
    clock = null;
    chart = null;
  }

  return { mount, destroy };
}
