/**
 * Phase 2-4 isolated "Simulated Exchange" view. It runs its own one-second
 * clock and order book and never touches the legacy 8-tick market or real data.
 */
import { pageHead, card, statCard, segmented, table } from '../kit.js';
import { CandlestickChart } from '../chart.js';
import { money, moneyCompact, num, pct } from '../../core/format.js';
import { toast } from '../components.js';
import { sectorLabel } from '../labels.js';
import { SIM_COMPANIES } from '../../sim/companies50.js';
import {
  createExchangeEngine, advanceSecond, advanceDay, getCandles, getBook,
  submitOrder, cancelOrder, equity, positionRows, openOrderRows,
  serializeExchange, deserializeExchange, simClock, simDate,
  latestReport, reportHistory, dividendPerShare, SIM_EXCHANGE_SAVE_KEY,
} from '../../sim/exchangeEngine.js';
import { SimulationClock, SIM_SPEEDS } from '../../sim/simulationClock.js';
import { nextMacroEventDay } from '../../sim/macroEconomy.js';
import { sectorSensitivity } from '../../sim/industryModel.js';
import { quarterLabel } from '../../sim/fundamentals.js';

const SAVE_KEY = SIM_EXCHANGE_SAVE_KEY;
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
  const { i18n, toast: notify, router } = ctx;
  let container = null;
  const t = (key, params) => i18n.t(key, params);
  const moneyFmt = (value) => money(value, i18n.locale);
  const numFmt = (value, digits = 0) => num(value, i18n.locale, digits);
  const pctFmt = (value, digits = 2) => pct(value, i18n.locale, digits);
  const pctPlain = (value, digits = 2) => pct(value, i18n.locale, digits, false);
  const signedNum = (value, digits = 1) => `${value > 0 ? '+' : ''}${numFmt(value, digits)}`;
  const macroValue = (type, value, signed = false) => {
    if (type === 'payrolls') return `${value > 0 && signed ? '+' : ''}${numFmt(value, 0)}K`;
    if (type === 'energy') return moneyFmt(value);
    if (type === 'cpi' || type === 'gdp' || type === 'centralBank') {
      return pct(value, i18n.locale, 2, signed);
    }
    return numFmt(value, 2);
  };
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
    const bid = q.bid === null ? '—' : moneyFmt(q.bid);
    const ask = q.ask === null ? '—' : moneyFmt(q.ask);
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
          <span>${t('exchange.bid')} <strong>${bid}</strong></span>
          <span>${t('exchange.ask')} <strong>${ask}</strong></span>
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
      <span class="muted"><span id="sim-date">${simDate(state.dayIndex)}</span> · ${t('exchange.session')}</span>
    </div>`;
  }

  function controlsHtml() {
    return `<div class="exchange-controls">
      <button class="btn btn--primary" type="button" data-sim-play>${clock && clock.running ? t('exchange.pause') : t('exchange.play')}</button>
      ${Object.keys(SIM_SPEEDS).map((speed) => `<button class="speed-btn ${clock && clock.speed === Number(speed) ? 'is-active' : ''}" type="button" data-sim-speed="${speed}">${speed}×</button>`).join('')}
      <button class="btn" type="button" data-sim-step="1">${t('exchange.stepSecond')}</button>
      <button class="btn" type="button" data-sim-step="60">${t('exchange.stepMinute')}</button>
      <button class="btn" type="button" data-sim-step-day>${t('exchange.stepDay')}</button>
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
      head: [t('exchange.order'), t('exchange.ticker'), t('exchange.side'), t('exchange.type'), t('exchange.orderStatus'), t('exchange.qty'), t('exchange.filled'), t('exchange.limitPrice'), ''],
      rows: rows.map((order) => [
        order.id,
        order.ticker,
        t(`exchange.${order.side}`),
        t(`exchange.${order.type}`),
        t(`exchange.status.${order.status}`),
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
      head: [t('exchange.time'), t('exchange.order'), t('exchange.ticker'), t('exchange.side'), t('exchange.qty'), t('exchange.price'), t('exchange.fee')],
      rows: trades.map((trade) => [
        `${trade.date} ${trade.time}`,
        trade.orderId,
        trade.ticker,
        t(`exchange.${trade.side}`),
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

  function macroHtml() {
    const macro = state.macro;
    const events = macro.events || [];
    const event = events.length ? events[events.length - 1] : null;
    const next = nextMacroEventDay(state.dayIndex);
    const warning = ['crisis', 'liquidity', 'recession', 'bear', 'highVol']
      .includes(macro.regime);
    const indicators = [
      [t('exchange.macroPolicyRate'), pctPlain(macro.policyRate, 2)],
      [t('exchange.macroInflation'), pctPlain(macro.inflation, 2)],
      [t('exchange.macroUnemployment'), pctPlain(macro.unemployment, 2)],
      [t('exchange.macroGdp'), pctPlain(macro.gdpGrowth, 2)],
      [t('exchange.macroCreditGrowth'), pctPlain(macro.creditGrowth, 2)],
      [t('exchange.macroRiskAppetite'), numFmt(macro.riskAppetite, 0)],
      [t('exchange.macroEnergyPrice'), moneyFmt(macro.energyPrice)],
      [t('exchange.macroConfidence'), numFmt(macro.consumerConfidence, 1)],
    ];
    return `<div class="exchange-macro">
      <div class="exchange-macro__head">
        <div>
          <span class="pill ${warning ? 'pill--warn' : 'pill--ok'}">${t(`exchange.macro.regime.${macro.regime}`)}</span>
          ${macro.bubbleSector ? `<span class="pill pill--warn">${t('exchange.macroBubble', {
            sector: sectorLabel(ctx, macro.bubbleSector),
          })}</span>` : ''}
        </div>
        <span class="muted">${t('exchange.macroNextEvent', { date: simDate(next) })}</span>
      </div>
      <div class="exchange-macro__grid">
        ${indicators.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
      </div>
      ${event ? `<div class="exchange-macro__event">
        <div class="exchange-macro__eventhead">
          <strong>${t(`exchange.macroEvent.${event.type}.label`)}</strong>
          <span class="muted">${simDate(event.day)}</span>
        </div>
        <div class="exchange-macro__grid">
          <div><span>${t('exchange.macroActual')}</span><strong>${macroValue(event.type, event.actual)}</strong></div>
          <div><span>${t('exchange.macroForecast')}</span><strong>${macroValue(event.type, event.forecast)}</strong></div>
          <div><span>${t('exchange.macroSurprise')}</span><strong class="${event.marketTone === 'positive' ? 'up' : event.marketTone === 'negative' ? 'down' : 'flat'}">${macroValue(event.type, event.difference, true)}</strong></div>
        </div>
        <p class="muted">${t(`exchange.macroEvent.${event.type}.summary`, {
          actual: macroValue(event.type, event.actual),
          forecast: macroValue(event.type, event.forecast),
        })}</p>
      </div>` : `<p class="muted">${t('exchange.macroNoEvent')}</p>`}
    </div>`;
  }

  function companyProfileHtml() {
    const cs = state.companies[selected];
    const company = cs.company;
    const quote = state.quotes[selected];
    const report = latestReport(state, selected);
    const history = reportHistory(state, selected, 4);
    const annualDividend = dividendPerShare(state, selected);
    const yieldPct = quote.last ? annualDividend / quote.last * 100 : 0;
    const reportEpsCurrent = report
      ? report.income.eps * report.splitFactor / cs.splitFactor
      : null;
    const pe = reportEpsCurrent > 0 ? quote.last / (reportEpsCurrent * 4) : null;
    const sensitivity = sectorSensitivity(company.sector);
    const metrics = [
      [t('exchange.sector'), sectorLabel(ctx, company.sector)],
      [t('exchange.stageLabel'), t(`exchange.stage.${company.stage}`)],
      [t('exchange.riskLabel'), t(`exchange.risk.${company.risk}`)],
      [t('exchange.marketCap'), moneyCompact(company.marketCap, i18n.locale)],
      [t('exchange.pe'), pe === null ? '—' : numFmt(pe, 1)],
      [t('exchange.dividendYield'), pct(yieldPct, i18n.locale, 2, false)],
      [t('exchange.macroSensitivity'),
        `${signedNum(sensitivity.growth)} / ${signedNum(sensitivity.rates)} / ${signedNum(sensitivity.energy)}`],
    ];
    const reportMetrics = report ? [
      [t('exchange.reportRevenue'), moneyCompact(report.income.revenue, i18n.locale)],
      [t('exchange.reportNetIncome'), moneyCompact(report.income.netIncome, i18n.locale)],
      [t('exchange.reportEps'), moneyFmt(report.income.eps)],
      [t('exchange.reportGrossMargin'), pct(report.ratios.grossMargin * 100, i18n.locale, 1, false)],
      [t('exchange.reportOperatingMargin'), pct(report.ratios.operatingMargin * 100, i18n.locale, 1, false)],
      [t('exchange.reportNetMargin'), pct(report.ratios.netMargin * 100, i18n.locale, 1, false)],
      [t('exchange.reportOperatingCashFlow'), moneyCompact(report.cashFlow.operatingCashFlow, i18n.locale)],
      [t('exchange.reportAssets'), moneyCompact(report.balance.totalAssets, i18n.locale)],
      [t('exchange.reportLiabilities'), moneyCompact(report.balance.totalLiabilities, i18n.locale)],
      [t('exchange.reportEquity'), moneyCompact(report.balance.equity, i18n.locale)],
      [t('exchange.reportCash'), moneyCompact(report.balance.cash, i18n.locale)],
      [t('exchange.reportDividendPerShare'), moneyFmt(report.ratios.annualDividendPerShare)],
    ] : [];
    const historyRows = history.map((item) => [
      `${item.periodLabel}${item.splitFactor > 1 ? ` · ×${numFmt(item.splitFactor)}` : ''}`,
      moneyCompact(item.income.revenue, i18n.locale),
      moneyCompact(item.income.netIncome, i18n.locale),
      moneyFmt(item.income.eps),
      pct(item.ratios.netMargin * 100, i18n.locale, 1, false),
      moneyCompact(item.cashFlow.operatingCashFlow, i18n.locale),
    ]);
    return `
      <div class="exchange-company">
        <div class="exchange-company__head">
          <div><strong>${company.name}</strong><span class="muted">${selected} · ${sectorLabel(ctx, company.sector)}</span></div>
          <span class="pill">${t(`exchange.stage.${company.stage}`)}</span>
        </div>
        <p class="muted exchange-company__desc">${company.description}</p>
        <div class="exchange-company__meta">
          ${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
        </div>
        ${report ? `
          <div class="exchange-report">
            <div class="exchange-report__head">
              <div><strong>${report.periodLabel}</strong><span class="muted">${t('exchange.reportedOn', { date: report.reportDate })}</span></div>
              ${report.splitFactor > 1 ? `<span class="pill">${t('exchange.splitAdjusted', { factor: numFmt(report.splitFactor) })}</span>` : ''}
            </div>
            <div class="exchange-report__grid">
              ${reportMetrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
            </div>
            ${historyRows.length ? table({
              head: [
                t('exchange.reportPeriod'), t('exchange.reportRevenue'), t('exchange.reportNetIncome'),
                t('exchange.reportEps'), t('exchange.reportNetMargin'), t('exchange.reportOperatingCashFlow'),
              ],
              rows: historyRows,
            }) : ''}
          </div>` : `<p class="muted">${t('exchange.noReport')}</p>`}
      </div>`;
  }

  function dividendsHtml() {
    const rows = state.account.dividends.slice(-10).reverse();
    const total = state.account.dividends.reduce((sum, item) => sum + item.amount, 0);
    return `${rows.length ? `<p class="muted">${t('exchange.dividendsTotal', { amount: moneyFmt(total) })}</p>` : ''}
      ${table({
        head: [t('exchange.time'), t('exchange.ticker'), t('exchange.qty'), t('exchange.dividendPerShare'), t('exchange.dividendAmount')],
        rows: rows.map((item) => [
          simDate(item.day),
          item.ticker,
          numFmt(item.qty),
          moneyFmt(item.dps),
          moneyFmt(item.amount),
        ]),
        empty: t('exchange.noDividends'),
      })}`;
  }

  function eventsHtml() {
    const reports = state.reports
      .filter((item) => item.ticker === selected)
      .map((item) => ({ ...item, kind: 'earnings' }));
    const splits = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'split')
      .map((item) => ({ ...item, kind: 'split' }));
    const guidance = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'guidance')
      .map((item) => ({ ...item, kind: 'guidance' }));
    const dividends = state.account.dividends
      .filter((item) => item.ticker === selected)
      .map((item) => ({ ...item, kind: 'dividend' }));
    const events = [...reports, ...splits, ...guidance, ...dividends]
      .sort((a, b) => b.day - a.day)
      .slice(0, 8);
    if (!events.length) return `<p class="muted">${t('exchange.noEvents')}</p>`;
    return `<ul class="aside-list exchange-events">${events.map((event) => {
      if (event.kind === 'earnings') {
        return `<li><strong>${t('exchange.eventEarnings')}</strong><span>${event.periodLabel} · ${t('exchange.eventEps', {
          eps: moneyFmt(event.eps),
          expected: moneyFmt(event.expectedEps),
          surprise: pct(event.surprise * 100, i18n.locale, 1),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'guidance') {
        return `<li><strong>${t('exchange.eventGuidance')}</strong><span>${t('exchange.eventGuidanceText', {
          quarter: quarterLabel(event.quarter),
          eps: moneyFmt(event.eps),
          baseline: moneyFmt(event.baseline),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'split') {
        return `<li><strong>${t('exchange.eventSplit')}</strong><span>${t('exchange.eventSplitText', {
          ratio: numFmt(event.ratio),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      return `<li><strong>${t('exchange.eventDividend')}</strong><span>${t('exchange.eventDividendText', {
        qty: numFmt(event.qty),
        amount: moneyFmt(event.amount),
      })}</span><span class="muted">${simDate(event.day)}</span></li>`;
    }).join('')}</ul>`;
  }

  function newsHtml() {
    const events = state.news.slice(-8).reverse();
    if (!events.length) return `<p class="muted">${t('exchange.noNews')}</p>`;
    return `<ul class="aside-list exchange-news">${events.map((event) => {
      const params = event.scope === 'sector'
        ? { ...event.params, sector: sectorLabel(ctx, event.sector) }
        : event.params;
      const scopeLabel = event.scope === 'company'
        ? event.ticker
        : event.scope === 'sector' ? sectorLabel(ctx, event.sector) : t('exchange.marketWide');
      return `<li>
        <div class="exchange-news__head"><strong>${t(`exchange.news.${event.template}.headline`, params)}</strong>
          <span class="pill ${event.impact > 0 ? 'pill--ok' : 'pill--warn'}">${pct(event.impact * 100, i18n.locale, 1)}</span></div>
        <span>${t(`exchange.news.${event.template}.summary`, params)}</span>
        <span class="muted">${scopeLabel} · ${simDate(event.day)}</span>
      </li>`;
    }).join('')}</ul>`;
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
            ${card({
              id: 'sim-company-card',
              title: t('exchange.companyProfile'),
              subtitle: t('exchange.companyProfileSubtitle'),
              actions: `<button class="btn btn--ghost btn--sm" type="button" data-statement-link>${t('exchange.viewStatements')}</button>`,
              body: `<div id="sim-company">${companyProfileHtml()}</div>`,
            })}
            ${card({ title: t('exchange.positions'), body: `<div id="sim-positions">${positionsHtml()}</div>` })}
            ${card({ title: t('exchange.orders'), body: `<div id="sim-orders">${ordersHtml()}</div>` })}
            ${card({ title: t('exchange.trades'), body: `<div id="sim-trades">${tradesHtml()}</div>` })}
            ${card({ title: t('exchange.dividends'), body: `<div id="sim-dividends">${dividendsHtml()}</div>` })}
          </div>
          <div class="exchange-side">
            ${card({ title: t('exchange.book'), subtitle: t('exchange.bookSubtitle'), body: `<div id="sim-book">${bookHtml()}</div>` })}
            ${card({ title: t('exchange.macroTitle'), subtitle: t('exchange.macroSubtitle'), body: `<div id="sim-macro">${macroHtml()}</div>` })}
            ${card({ title: t('exchange.newsTitle'), subtitle: t('exchange.newsSubtitle'), body: `<div id="sim-news">${newsHtml()}</div>` })}
            ${card({ title: t('exchange.events'), subtitle: t('exchange.eventsSubtitle'), body: `<div id="sim-events">${eventsHtml()}</div>` })}
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
    set('#sim-date', simDate(state.dayIndex));
    set('#sim-book', bookHtml());
    set('#sim-positions', positionsHtml());
    set('#sim-orders', ordersHtml());
    set('#sim-trades', tradesHtml());
    set('#sim-company', companyProfileHtml());
    set('#sim-dividends', dividendsHtml());
    set('#sim-macro', macroHtml());
    set('#sim-news', newsHtml());
    set('#sim-events', eventsHtml());
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
      pending: true,
    });
    if (!result.ok) {
      toastFn(t(`exchange.error.${result.error}`), 'error');
      return;
    }
    if (result.order.status === 'pending') {
      toastFn(t('exchange.submittedPending', { qty: result.order.qty }), 'info');
      paint(true);
      return;
    }
    toastFn(t('exchange.submitted', {
      status: t(`exchange.status.${result.order.status}`),
      filled: result.order.filledQty,
      qty: result.order.qty,
    }), result.order.filledQty ? 'success' : 'info');
    paint(true);
  }

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, serializeExchange(state));
      return true;
    } catch (error) {
      console.warn('[exchange] save failed', error);
      return false;
    }
  }

  function save() {
    if (persist()) toastFn(t('exchange.saved'), 'success');
    else toastFn(t('exchange.saveFailed'), 'error');
  }

  function reset() {
    if (typeof window !== 'undefined' && window.confirm(t('exchange.resetConfirm'))) {
      state = createExchangeEngine({ seed: 'sim-exchange-v1' });
      selected = 'NCRT';
      timeframe = '5m';
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (error) {
        console.warn('[exchange] reset save failed', error);
      }
      if (clock) {
        clock.pause();
        clock.secondCounter = 0;
      }
      mountPage();
      toastFn(t('exchange.resetDone'), 'success');
    }
  }

  function bind() {
    container.addEventListener('click', (event) => {
      const target = event.target.closest('[data-sim-play],[data-sim-speed],[data-sim-step],[data-sim-step-day],[data-sim-save],[data-sim-reset],[data-sim-tf],[data-sim-cancel],[data-statement-link]');
      if (!target) return;
      if (target.matches('[data-sim-step-day]')) {
        if (clock.running) clock.pause();
        advanceDay(state);
        clock.secondCounter = state.second;
        paint(true);
        return;
      }
      if (target.matches('[data-statement-link]')) {
        if (!persist()) { toastFn(t('exchange.saveFailed'), 'error'); return; }
        if (router) router.go(`/exchange/statements/${selected}`);
        return;
      }
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
        if (count >= 60) clock.stepMinute();
        else clock.step();
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
    if (clock) clock.destroy();
    if (chart) chart.destroy();
    container = root;
    destroyed = false;
    clock = new SimulationClock({
      onSecond,
      onMinute,
      speed: 5,
    });
    clock.pause();
    clock.secondCounter = state.second;
    mountPage();
    bind();
    const play = container.querySelector('[data-sim-play]');
    if (play) play.textContent = t('exchange.play');
  }

  function render() {
    if (container && !destroyed) paint(true);
  }

  function destroy() {
    destroyed = true;
    if (clock) clock.destroy();
    if (chart) chart.destroy();
    clock = null;
    chart = null;
  }

  return { mount, render, destroy };
}
