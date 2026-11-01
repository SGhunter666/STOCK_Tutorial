/**
 * Historical Replay Lab: real Nasdaq daily bars, independent virtual account,
 * eight intraday ticks per day derived from the real OHLC bar, fills at the
 * current intraday tick price.
 */
import { pageHead, card, statCard, segmented } from '../kit.js';
import { icon } from '../icons.js';
import { CandlestickChart } from '../chart.js';
import { progressBar } from '../dom.js';
import { money, pct, num, signedMoney } from '../../core/format.js';
import {
  HISTORY_SCENARIOS, HISTORY_SECTOR_PACKS, getHistoryScenario, eventsUpTo,
} from '../../data/historyScenarios.js';
import { loadHistoryDataset } from '../../history/dataLoader.js';
import {
  runFor, ensureRunInStore, advanceHistory, tradeHistory, resetHistory, selectTicker,
  tickHistory,
} from '../../history/replayActions.js';
import {
  summaryAtTick, quoteAtTick, quotesAtTick, currentDate, historyCandles, localeDateText,
  HISTORY_FEE, HISTORY_TIMEFRAMES,
} from '../../history/replayEngine.js';
import { TICKS_PER_DAY, sessionClock } from '../../market/calendar.js';
import { confirmModal } from '../components.js';
import { sectorLabel } from '../labels.js';

export function createHistoryListView(ctx) {
  const { i18n, store, router } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;

  function scenarioCard(scenario, state) {
    const run = state.historyRuns ? state.historyRuns[scenario.id] : null;
    return `
      <article class="history-card">
        <header class="history-card__head">
          <div>
            <span class="pill pill--ok">${t('history.realDataBadge')}</span>
            <h2 class="history-card__title">${t(scenario.titleKey)}</h2>
            <p class="history-card__subtitle">${t(scenario.subtitleKey)}</p>
          </div>
          <span class="pill">${t(scenario.difficultyKey)}</span>
        </header>
        <p class="history-card__desc">${t(scenario.descKey)}</p>
        <dl class="history-card__meta">
          <div><dt>${t('history.periodLabel')}</dt><dd>${t(scenario.periodKey)}</dd></div>
          <div><dt>${t('history.universeLabel')}</dt><dd>${t('history.tickersCount', { count: scenario.symbols.length })}</dd></div>
          <div><dt>${t('history.durationLabel')}</dt><dd>${t('history.daysCount', { count: scenario.approxDays })}</dd></div>
        </dl>
        <div class="${scenario.sectorUniverse ? 'history-packs' : 'segment-tickers history-card__tickers'}">
          ${scenario.sectorUniverse
            ? `${HISTORY_SECTOR_PACKS.map((pack) => `<span class="history-pack"><strong>${t(pack.labelKey)}</strong><em>${pack.tickers.length}</em></span>`).join('')}<span class="history-pack"><strong>QQQ</strong><em>${t('history.benchmark')}</em></span>`
            : `${scenario.symbols.slice(0, 12).map((symbol) => `<span class="${symbol === 'QQQ' ? 'is-benchmark' : ''}">${symbol}</span>`).join('')}${scenario.symbols.length > 12 ? `<span class="history-more">+${scenario.symbols.length - 12}</span>` : ''}`}
        </div>
        <footer class="history-card__foot">
          <span class="muted">${run ? t('history.continueHint') : t('history.startHint')}</span>
          <button class="btn btn--primary btn--sm" type="button" data-open="${scenario.id}">
            ${run ? t('history.continue') : t('history.start')} ${icon('arrowRight', { size: 14 })}
          </button>
        </footer>
      </article>`;
  }

  function template(state) {
    return `
      <div class="history-page">
        ${pageHead({
          eyebrow: t('history.eyebrow'),
          title: t('history.title'),
          subtitle: t('history.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy">${icon('academy', { size: 15 })} ${t('nav.academy')}</button>`,
        })}
        <div class="history-source">
          <span class="history-source__icon">${icon('info', { size: 18 })}</span>
          <div>
            <strong>${t('history.sourceTitle')}</strong>
            <p>${t('history.sourceNote')}</p>
          </div>
        </div>
        <div class="history-cards">
          ${HISTORY_SCENARIOS.map((scenario) => scenarioCard(scenario, state)).join('')}
        </div>
        <div class="callout callout--warning history-disclaimer">
          <span class="callout__label">${t('history.disclaimerLabel')}</span>
          <p>${t('history.disclaimer')}</p>
        </div>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const open = event.target.closest('[data-open]');
      if (open) {
        router.go(`/history/${open.dataset.open}`);
        return;
      }
      const go = event.target.closest('[data-go]');
      if (go) router.go(go.dataset.go);
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
  }

  function destroy() {}

  return { mount, render, destroy };
}

export function createHistoryScenarioView(ctx, scenarioId) {
  const {
    i18n, store, router, toast, clock, actions,
  } = ctx;
  const t = (key, p) => i18n.t(key, p);
  const scenario = getHistoryScenario(scenarioId);
  let root;
  let container;
  let dataset = null;
  let loading = true;
  let loadError = false;
  let chart = null;
  let selectedTicker = 'AAPL';
  let side = 'buy';
  let qty = '10';
  let groupFilter = 'all';
  let query = '';
  let timeframe = '1d';

  function run(state) {
    return runFor(state, scenarioId);
  }

  async function loadData() {
    if (!scenario) {
      loading = false;
      loadError = true;
      render(store.get());
      return;
    }
    try {
      dataset = await loadHistoryDataset(scenario);
      ensureRunInStore(store, scenarioId, dataset);
      loading = false;
      const currentRun = run(store.get());
      const saved = currentRun && currentRun.selectedTicker;
      const usable = saved && dataset.tickers.some((entry) => entry.symbol === saved);
      selectedTicker = usable
        ? saved
        : (dataset.tickers.find((entry) => !entry.benchmark)?.symbol || dataset.tickers[0].symbol);
      render(store.get());
    } catch (error) {
      console.error('[history] data load failed', error);
      loading = false;
      loadError = true;
      render(store.get());
    }
  }

  function currentQuote(state) {
    if (!dataset) return null;
    const current = run(state);
    return quoteAtTick(dataset, selectedTicker, current.dayIndex, current.tick || 0);
  }

  function estimate(state) {
    const currentRun = run(state);
    const quote = currentQuote(state);
    if (!quote || !currentRun) return { qty: 0, price: 0, fee: HISTORY_FEE, total: 0, error: '' };
    const quantity = Math.max(0, Math.floor(Number(qty) || 0));
    const gross = quantity * quote.last;
    const total = side === 'buy' ? gross + HISTORY_FEE : gross - HISTORY_FEE;
    const ticker = dataset.tickers.find((entry) => entry.symbol === selectedTicker);
    let error = '';
    if (ticker && ticker.benchmark) error = t('error.benchmarkNotTradable');
    else if (quantity <= 0) error = t('error.qtyInvalid');
    else if (side === 'buy' && total > currentRun.account.cash + 1e-9) error = t('error.insufficientCash');
    else if (side === 'sell' && quantity > (currentRun.account.positions[selectedTicker]?.qty || 0)) error = t('error.insufficientShares');
    return { qty: quantity, price: quote.last, fee: HISTORY_FEE, total, gross, error, quote };
  }

  function controls(sum) {
    const running = Boolean(clock && clock.running);
    const speed = clock ? clock.speed : (store.get().settings.speed || 1);
    return `
      <div class="history-strip">
        <div class="history-strip__date">
          <span class="field-label">${t('history.currentDate')}</span>
          <strong id="history-date">${localeDateText(sum.date, i18n.locale)}</strong>
          <span class="muted" id="history-session">${sessionClock(sum.tick)} · ${t('history.tickOf', { tick: sum.tick + 1, total: TICKS_PER_DAY })}</span>
          <span class="muted">${t('history.dayOf', { index: sum.dayIndex, total: sum.totalDays })}</span>
        </div>
        <div class="history-clock">
          <span class="field-label">${t('history.clockLabel')}</span>
          <div class="history-clock__controls">
            <button class="icon-btn" type="button" data-history-clock="toggle" title="${t(running ? 'history.pause' : 'history.play')}">
              ${icon(running ? 'pause' : 'play', { size: 16 })}
            </button>
            <div class="speed-group">
              ${[1, 5, 20].map((value) => `<button class="speed-btn ${running && speed === value ? 'is-active' : ''}" type="button" data-history-speed="${value}">${value}×</button>`).join('')}
            </div>
            <button class="icon-btn" type="button" data-history-next title="${t('history.nextDay')}">${icon('next', { size: 16 })}</button>
          </div>
          <span class="muted">${t('history.clockNote')}</span>
        </div>
        <div class="history-strip__controls">
          <span class="field-label">${t('history.jumpLabel')}</span>
          <button class="btn btn--ghost btn--sm" type="button" data-advance="1" ${sum.reachedEnd ? 'disabled' : ''}>+1 ${t('history.day')}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-advance="5" ${sum.reachedEnd ? 'disabled' : ''}>+5 ${t('history.dayShort')}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-advance="20" ${sum.reachedEnd ? 'disabled' : ''}>+20 ${t('history.dayShort')}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-advance="event" ${sum.reachedEnd ? 'disabled' : ''}>${t('history.nextEvent')}</button>
          ${sum.reachedEnd ? `<span class="pill pill--warn">${t('history.atEnd')}</span>` : ''}
        </div>
      </div>
      <div class="history-timeline">
        <div class="history-timeline__head">
          <span class="field-label">${t('history.timelineLabel')}</span>
          <span class="muted">${t('history.timelineRange', {
            start: localeDateText(dataset.tickers[0].bars[sum.startIndex]?.[0], i18n.locale),
            end: localeDateText(dataset.tickers[0].bars[sum.totalDays - 1]?.[0], i18n.locale),
          })}</span>
        </div>
        ${progressBar(sum.totalDays > 1 ? (sum.dayIndex / (sum.totalDays - 1)) * 100 : 0, 'accent')}
        <p class="chart-note muted">${t('history.warmupNote', { days: sum.startIndex })}</p>
      </div>`;
  }

  function chartCard(sum) {
    const currentRun = run(store.get());
    const quote = quoteAtTick(dataset, selectedTicker, currentRun.dayIndex, currentRun.tick || 0);
    const info = historyCandles(
      dataset, selectedTicker, currentRun.dayIndex, currentRun.tick || 0, timeframe, quote?.last,
    );
    const position = currentRun.account.positions[selectedTicker];
    const note = info.intraday
      ? t('history.chartNoteIntraday', { count: info.candles.length, tf: t(`history.tf.${timeframe}`) })
      : t('history.chartNote', { count: info.candles.length, tf: t(`history.tf.${timeframe}`) });
    return card({
      title: `${selectedTicker} · ${t('history.chartTitle')}`,
      subtitle: t('history.chartSubtitle'),
      actions: `
        ${segmented({
          options: HISTORY_TIMEFRAMES.map((value) => ({ value, label: t(`history.tf.${value}`) })),
          active: timeframe,
          attr: 'history-timeframe',
        })}
        <span class="pill">${t(scenario.periodKey)}</span>`,
      body: `
        <div class="chart-wrap"><canvas id="history-chart" style="height:340px"></canvas></div>
        <p class="chart-note muted">${note}${position ? ` · ${t('history.avgCostLine', { cost: money(position.costBasis / position.qty, i18n.locale) })}` : ''}</p>`,
    });
  }

  function ticketCard(state) {
    const est = estimate(state);
    const buy = side === 'buy';
    const currentRun = run(state);
    const cash = currentRun.account.cash;
    const owned = currentRun.account.positions[selectedTicker]?.qty || 0;
    return card({
      className: 'history-ticket-card',
      title: t('history.ticketTitle'),
      subtitle: t('history.ticketSubtitle'),
      body: `
        <div class="ticket">
          ${segmented({
            options: [{ value: 'buy', label: t('trade.buy') }, { value: 'sell', label: t('trade.sell') }],
            active: side,
            attr: 'history-side',
            className: `ticket__side ticket__side--${side}`,
          })}
          <div class="ticket__field">
            <span class="field-label">${t('history.selected')}</span>
            <strong class="history-selected" id="history-selected-price">${selectedTicker} · ${money(est.quote ? est.quote.last : 0, i18n.locale)}</strong>
          </div>
          <div class="ticket__field">
            <span class="field-label">${t('trade.quantity')}</span>
            <div class="qty-row">
              <input class="input" id="history-qty" type="number" min="1" step="1" value="${qty}" inputmode="numeric">
              <button class="btn btn--ghost btn--sm" type="button" id="history-max">${t('trade.max')}</button>
            </div>
            <span class="field-hint" id="history-hint">${buy ? t('history.cashLine', { value: money(cash, i18n.locale) }) : t('history.sharesLine', { value: num(owned, i18n.locale, 0) })}</span>
          </div>
          <div class="estimate">
            <div class="estimate-grid">
              <div class="estimate-row"><span>${t('history.closePrice')}</span><strong id="history-price">${money(est.price, i18n.locale)}</strong></div>
              <div class="estimate-row"><span>${t('trade.commission')}</span><strong id="history-fee">${money(est.fee, i18n.locale)}</strong></div>
              <div class="estimate-row estimate-row--total"><span>${buy ? t('trade.estimateTotal') : t('trade.estimateNet')}</span><strong id="history-total">${money(est.total, i18n.locale)}</strong></div>
            </div>
            <p class="inline-warning" id="history-warning" ${est.error ? '' : 'hidden'}>${est.error}</p>
            <p class="estimate-note">${t('history.fillNote')}</p>
          </div>
          <button class="btn ${buy ? 'btn--primary' : 'btn--danger'} btn--block" type="button" id="history-submit" ${est.error ? 'disabled' : ''}>
            ${buy ? t('trade.submitBuy') : t('trade.submitSell')}
          </button>
          <p class="ticket__risk">${t('history.feeNote', { fee: money(HISTORY_FEE, i18n.locale) })}</p>
        </div>`,
    });
  }

  function tickerTable(state) {
    const currentRun = run(state);
    const quotes = quotesAtTick(dataset, currentRun.dayIndex, currentRun.tick || 0);
    const groups = [];
    for (const ticker of dataset.tickers) {
      if (ticker.benchmark) continue;
      const id = ticker.pack || ticker.sector;
      const existing = groups.find((group) => group.id === id);
      if (existing) {
        existing.count += 1;
      } else {
        groups.push({
          id,
          label: ticker.pack ? t(`history.pack.${id}`) : sectorLabel(ctx, ticker.sector),
          count: 1,
        });
      }
    }
    return card({
      title: t('history.universeTitle'),
      subtitle: t('history.universeSubtitle', { count: dataset.tickers.length }),
      body: `
        <div class="history-filters">
          <div class="history-group-chips">
            <button class="chip ${groupFilter === 'all' ? 'is-active' : ''}" type="button" data-group="all">${t('history.allGroups')}</button>
            ${groups.map((group) => `<button class="chip ${groupFilter === group.id ? 'is-active' : ''}" type="button" data-group="${group.id}">${group.label}<span class="chip__count">${group.count}</span></button>`).join('')}
          </div>
          <label class="search-field history-search">
            ${icon('search', { size: 15 })}
            <input class="input input--search" id="history-search" type="search" placeholder="${t('history.filterPlaceholder')}" value="${query.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">
          </label>
        </div>
        <div class="table-wrap history-table-wrap">
          <table class="table history-table">
            <thead><tr>
              <th>${t('trade.ticker')}</th><th>${t('market.company')}</th><th class="num">${t('market.last')}</th>
              <th class="num">${t('market.change')}</th><th class="num">${t('history.owned')}</th><th></th>
            </tr></thead>
            <tbody>
              ${dataset.tickers.map((ticker) => {
                const quote = quotes[ticker.symbol];
                const owned = currentRun.account.positions[ticker.symbol]?.qty || 0;
                const exchange = /NMS|NGM|NGS/.test(ticker.exchange || '') ? 'NASDAQ'
                  : /NYQ|NYS/.test(ticker.exchange || '') ? 'NYSE' : (ticker.exchange || '');
                return `<tr class="history-row ${ticker.symbol === selectedTicker ? 'is-selected' : ''}"
                  data-symbol="${ticker.symbol}" data-group="${ticker.pack || ticker.sector}"
                  data-search="${(ticker.symbol + ' ' + ticker.name).toLowerCase()}">
                  <td><strong class="history-symbol">${ticker.symbol}</strong>${ticker.benchmark ? `<span class="pill pill--planned history-benchmark">${t('history.benchmark')}</span>` : ''}</td>
                  <td><span class="history-name">${ticker.name}</span><span class="sector-tag">${sectorLabel(ctx, ticker.sector)}</span><span class="exchange-tag">${exchange}</span></td>
                  <td class="num" data-hist-price="${ticker.symbol}">${money(quote.last, i18n.locale)}</td>
                  <td class="num ${quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat'}" data-hist-change="${ticker.symbol}">${pct(quote.changePct, i18n.locale, 2)}</td>
                  <td class="num">${owned ? num(owned, i18n.locale, 0) : '—'}</td>
                  <td><button class="link-btn" type="button" data-select="${ticker.symbol}">${ticker.symbol === selectedTicker ? t('history.selectedLabel') : t('history.select')}</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <p class="market-empty muted" id="history-empty" hidden>${t('history.noMatches')}</p>`,
    });
  }

  function positionsCard(state) {
    const sum = summaryAtTick(run(state), dataset);
    return card({
      title: t('history.positionsTitle'),
      subtitle: t('history.positionsSubtitle', { count: sum.rows.length }),
      body: sum.rows.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${t('trade.ticker')}</th><th class="num">${t('history.owned')}</th><th class="num">${t('portfolio.avgCost')}</th><th class="num">${t('portfolio.value')}</th><th class="num">${t('portfolio.pnl')}</th></tr></thead>
            <tbody>${sum.rows.map((row) => `<tr data-hist-position="${row.ticker}">
              <td>${row.ticker}</td>
              <td class="num">${num(row.qty, i18n.locale, 0)}</td>
              <td class="num">${money(row.avgCost, i18n.locale)}</td>
              <td class="num" data-pos-value="${row.ticker}">${money(row.value, i18n.locale)}</td>
              <td class="num ${row.pnl > 0 ? 'up' : row.pnl < 0 ? 'down' : ''}" data-pos-pnl="${row.ticker}">${signedMoney(row.pnl, i18n.locale)}</td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('history.noPositions')}</p>`,
    });
  }

  function tradesCard(state) {
    const trades = run(state).account.trades.slice(0, 8);
    return card({
      title: t('history.tradesTitle'),
      subtitle: t('history.tradesSubtitle'),
      body: trades.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${t('trade.date')}</th><th>${t('trade.side')}</th><th>${t('trade.ticker')}</th><th class="num">${t('trade.quantity')}</th><th class="num">${t('trade.price')}</th><th class="num">${t('trade.realized')}</th></tr></thead>
            <tbody>${trades.map((trade) => {
              const bar = dataset.tickers[0].bars[trade.day];
              return `<tr>
                <td>${localeDateText(bar ? bar[0] : '', i18n.locale)}</td>
                <td><span class="side-tag side-tag--${trade.side}">${t(`trade.${trade.side}`)}</span></td>
                <td>${trade.ticker}</td>
                <td class="num">${num(trade.qty, i18n.locale, 0)}</td>
                <td class="num">${money(trade.price, i18n.locale)}</td>
                <td class="num ${trade.realized > 0 ? 'up' : trade.realized < 0 ? 'down' : ''}">${trade.side === 'sell' ? signedMoney(trade.realized, i18n.locale) : '—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('history.noTrades')}</p>`,
    });
  }

  function eventsCard(state) {
    const date = currentDate(dataset, run(state).dayIndex);
    const occurred = eventsUpTo(scenario, date);
    return card({
      title: t('history.eventsTitle'),
      subtitle: t('history.eventsSubtitle'),
      className: 'history-events-card',
      body: occurred.length
        ? `<div class="history-events">${[...occurred].reverse().map((event) => `
            <article class="history-event history-event--${event.tone || 'neutral'}">
              <div class="history-event__meta">
                <span class="history-event__dot"></span>
                <span>${localeDateText(event.date, i18n.locale)}</span>
              </div>
              <h3>${t(event.titleKey)}</h3>
              <p>${t(event.textKey)}</p>
            </article>`).join('')}</div>`
        : `<p class="muted">${t('history.eventsEmpty')}</p>`,
    });
  }

  function tipsCard() {
    return card({
      title: t('history.tipsTitle'),
      body: `
        <ul class="aside-list history-tips">${scenario.tips.map((key) => `<li>${t(key)}</li>`).join('')}</ul>
        <div class="callout callout--tip">
          <span class="callout__label">${t('history.independentLabel')}</span>
          <p>${t('history.independentNote')}</p>
        </div>`,
    });
  }

  function loadingPage() {
    return `<div class="history-page">${pageHead({ eyebrow: t('history.eyebrow'), title: t('history.title') })}
      <div class="card history-loading"><span class="spinner"></span><span>${t('history.loading')}</span></div></div>`;
  }

  function errorPage() {
    return `<div class="history-page">${pageHead({ eyebrow: t('history.eyebrow'), title: t('history.title') })}
      <div class="card history-loading"><span>${t('history.loadError')}</span><button class="btn btn--ghost btn--sm" type="button" data-go="/history">${t('history.backToList')}</button></div></div>`;
  }

  function template(state) {
    const currentRun = run(state);
    const sum = summaryAtTick(currentRun, dataset);
    const title = `${t(scenario.titleKey)} · ${localeDateText(sum.date, i18n.locale)}`;
    return `
      <div class="history-page history-scenario">
        ${pageHead({
          eyebrow: t('history.scenarioEyebrow'),
          title,
          subtitle: `${t(scenario.subtitleKey)} · ${t('history.independentAccount')}`,
          actions: `
            <button class="btn btn--ghost btn--sm" type="button" data-go="/history">${icon('chevronLeft', { size: 14 })} ${t('history.backToList')}</button>
            <button class="btn btn--ghost btn--sm" type="button" data-reset="true">${icon('refresh', { size: 14 })} ${t('history.resetShort')}</button>`,
        })}
        ${controls(sum)}
        <div class="stat-grid">
          ${statCard({ id: 'hist-equity', label: t('history.statEquity'), value: money(sum.total, i18n.locale), sub: t('history.sinceStartPct', { pct: pct(sum.returnPct, i18n.locale, 2) }), tone: sum.pnl > 0 ? 'up' : sum.pnl < 0 ? 'down' : '', iconName: 'portfolio' })}
          ${statCard({ id: 'hist-cash', label: t('history.statCash'), value: money(sum.cash, i18n.locale), sub: t('history.statCashSub'), iconName: 'glossary' })}
          ${statCard({ id: 'hist-pnl', label: t('history.statPnl'), value: signedMoney(sum.pnl, i18n.locale), sub: t('history.statPnlSub'), tone: sum.pnl > 0 ? 'up' : sum.pnl < 0 ? 'down' : '', iconName: 'trading' })}
          ${statCard({ id: 'hist-benchmark', label: t('history.statBenchmark'), value: pct(sum.benchmarkReturn, i18n.locale, 2), sub: t('history.statBenchmarkSub'), tone: sum.benchmarkReturn > 0 ? 'up' : sum.benchmarkReturn < 0 ? 'down' : '', iconName: 'market' })}
        </div>
        <div class="history-main-grid">
          ${chartCard(sum)}
          ${ticketCard(state)}
        </div>
        <div class="history-lower-grid">
          ${tickerTable(state)}
          ${eventsCard(state)}
        </div>
        <div class="history-bottom-grid">
          ${positionsCard(state)}
          ${tradesCard(state)}
          ${tipsCard()}
        </div>
        <div class="history-source history-source--compact">
          <span class="history-source__icon">${icon('info', { size: 16 })}</span>
          <div>
            <strong>${t('history.sourceTitle')}</strong>
            <p>${t('history.sourceNote')} ${t('history.adjustedNote')}</p>
          </div>
        </div>
      </div>`;
  }

  function chartPayload(state) {
    if (!dataset) return null;
    const currentRun = run(state);
    const tick = currentRun.tick || 0;
    const quote = quoteAtTick(dataset, selectedTicker, currentRun.dayIndex, tick);
    const info = historyCandles(
      dataset, selectedTicker, currentRun.dayIndex, tick, timeframe, quote?.last,
    );
    if (!info.candles.length) return null;
    const labels = info.intraday
      ? info.labels
      : info.labels.map((date) => localeDateText(date, i18n.locale));
    const position = currentRun.account.positions[selectedTicker];
    return {
      candles: info.candles,
      labels,
      markers: position
        ? [{ value: position.costBasis / position.qty, label: t('history.avgCostMarker'), color: 'rgba(245,183,80,0.85)' }]
        : [],
    };
  }

  function updateChart(state) {
    if (!chart) return;
    const payload = chartPayload(state);
    if (payload) chart.setData(payload);
  }

  function renderChart(state) {
    if (!dataset) return;
    if (chart) chart.destroy();
    const canvas = container.querySelector('#history-chart');
    if (!canvas) return;
    chart = new CandlestickChart(canvas, {
      height: 340,
      showVolume: true,
      yFormat: (value) => money(value, i18n.locale),
      markers: [],
    });
    updateChart(state);
  }

  function refreshEstimate(state) {
    qty = container.querySelector('#history-qty')?.value ?? qty;
    const est = estimate(state);
    const currentRun = run(state);
    const set = (id, value) => {
      const node = container.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    set('history-selected-price', `${selectedTicker} · ${money(est.quote ? est.quote.last : 0, i18n.locale)}`);
    set('history-price', money(est.price, i18n.locale));
    set('history-fee', money(est.fee, i18n.locale));
    set('history-total', money(est.total, i18n.locale));
    set('history-hint', side === 'buy'
      ? t('history.cashLine', { value: money(currentRun.account.cash, i18n.locale) })
      : t('history.sharesLine', { value: num(currentRun.account.positions[selectedTicker]?.qty || 0, i18n.locale, 0) }));
    const submit = container.querySelector('#history-submit');
    if (submit) submit.disabled = Boolean(est.error);
    const warning = container.querySelector('#history-warning');
    if (warning) {
      warning.textContent = est.error || '';
      warning.hidden = !est.error;
    }
  }

  function patchStats(state) {
    const sum = summaryAtTick(run(state), dataset);
    const set = (id, value) => {
      const node = container.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    set('hist-equity', money(sum.total, i18n.locale));
    set('hist-equity-sub', t('history.sinceStartPct', { pct: pct(sum.returnPct, i18n.locale, 2) }));
    set('hist-cash', money(sum.cash, i18n.locale));
    set('hist-pnl', signedMoney(sum.pnl, i18n.locale));
    set('hist-benchmark', pct(sum.benchmarkReturn, i18n.locale, 2));
  }

  function patchTickerRows(state) {
    const currentRun = run(state);
    container.querySelectorAll('[data-hist-price]').forEach((cell) => {
      const quote = quoteAtTick(dataset, cell.dataset.histPrice, currentRun.dayIndex, currentRun.tick || 0);
      if (quote) cell.textContent = money(quote.last, i18n.locale);
    });
    container.querySelectorAll('[data-hist-change]').forEach((cell) => {
      const quote = quoteAtTick(dataset, cell.dataset.histChange, currentRun.dayIndex, currentRun.tick || 0);
      if (!quote) return;
      cell.textContent = pct(quote.changePct, i18n.locale, 2);
      cell.classList.toggle('up', quote.changePct > 0);
      cell.classList.toggle('down', quote.changePct < 0);
      cell.classList.toggle('flat', quote.changePct === 0);
    });
  }

  function patchPositions(state) {
    const sum = summaryAtTick(run(state), dataset);
    for (const row of sum.rows) {
      const value = container.querySelector(`[data-pos-value="${row.ticker}"]`);
      if (value) value.textContent = money(row.value, i18n.locale);
      const pnl = container.querySelector(`[data-pos-pnl="${row.ticker}"]`);
      if (pnl) {
        pnl.textContent = signedMoney(row.pnl, i18n.locale);
        pnl.classList.toggle('up', row.pnl > 0);
        pnl.classList.toggle('down', row.pnl < 0);
      }
    }
  }

  function onTick(state) {
    if (!container || !dataset) return;
    updateChart(state);
    patchStats(state);
    patchTickerRows(state);
    patchPositions(state);
    refreshEstimate(state);
    const session = container.querySelector('#history-session');
    if (session) {
      const currentRun = run(state);
      session.textContent = `${sessionClock(currentRun.tick || 0)} · ${t('history.tickOf', {
        tick: (currentRun.tick || 0) + 1,
        total: TICKS_PER_DAY,
      })}`;
    }
  }

  function onClockTick() {
    if (!dataset) return;
    const result = tickHistory(store, scenarioId, dataset);
    if (result.reachedEnd) {
      if (clock && clock.running) actions.toggleClock();
      render(store.get());
    }
  }

  function onClockFastForward() {
    if (!dataset) return;
    const next = advanceHistory(store, scenarioId, dataset, scenario, { days: 1 });
    if (summaryAtTick(next, dataset).reachedEnd) {
      if (clock && clock.running) actions.toggleClock();
      render(store.get());
    }
  }

  function applyHistoryFilters() {
    if (!container) return;
    const rows = [...container.querySelectorAll('.history-row')];
    const needle = query.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const matchesGroup = groupFilter === 'all' || row.dataset.group === groupFilter;
      const matchesQuery = !needle || row.dataset.search.includes(needle);
      const show = matchesGroup && matchesQuery;
      row.hidden = !show;
      if (show) visible += 1;
    }
    const empty = container.querySelector('#history-empty');
    if (empty) empty.hidden = visible > 0;
  }

  function bind(state) {
    container.querySelector('[data-history-clock]')?.addEventListener('click', () => {
      if (clock && !clock.running && clock.speed === 0) {
        actions.setSpeed(1);
      } else {
        actions.toggleClock();
        render(store.get());
      }
    });
    container.querySelectorAll('[data-history-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        actions.setSpeed(Number(button.dataset.historySpeed));
        render(store.get());
      });
    });
    container.querySelector('[data-history-next]')?.addEventListener('click', () => {
      actions.nextDay();
    });
    container.querySelectorAll('[data-history-timeframe]').forEach((button) => {
      button.addEventListener('click', () => {
        timeframe = button.dataset.historyTimeframe;
        render(store.get());
      });
    });
    container.querySelectorAll('.history-group-chips [data-group]').forEach((button) => {
      button.addEventListener('click', () => {
        groupFilter = button.dataset.group;
        container.querySelectorAll('.history-group-chips [data-group]').forEach((node) => {
          node.classList.toggle('is-active', node.dataset.group === groupFilter);
        });
        applyHistoryFilters();
      });
    });
    container.querySelector('#history-search')?.addEventListener('input', (event) => {
      query = event.target.value;
      applyHistoryFilters();
    });
    container.querySelectorAll('[data-advance]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.advance;
        const beforeDate = currentDate(dataset, run(store.get()).dayIndex);
        if (value === 'event' && !scenario.events.some((event) => event.date > beforeDate)) {
          toast(i18n.t('history.noMoreEvents'), 'info', 3400);
          return;
        }
        const beforeEvents = eventsUpTo(scenario, beforeDate).length;
        const next = advanceHistory(store, scenarioId, dataset, scenario, value === 'event'
          ? { toNextEvent: true }
          : { days: Number(value) });
        const afterDate = currentDate(dataset, next.dayIndex);
        const afterEvents = eventsUpTo(scenario, afterDate);
        if (afterEvents.length > beforeEvents) {
          const latest = afterEvents[afterEvents.length - 1];
          toast(i18n.t('history.eventReached', { title: t(latest.titleKey), date: localeDateText(latest.date, i18n.locale) }), 'info', 4600);
        }
        if (summaryAtTick(next, dataset).reachedEnd) toast(i18n.t('history.endReached'), 'warning', 4200);
      });
    });
    container.querySelectorAll('[data-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        confirmModal({
          title: t('history.resetTitle'),
          message: t('history.resetMessage'),
          confirmLabel: t('history.resetConfirm'),
          danger: true,
        }).then((confirmed) => {
          if (!confirmed) return;
          resetHistory(store, scenarioId);
          qty = '10';
          side = 'buy';
          toast(i18n.t('history.resetDone'), 'success');
        });
      });
    });
    container.querySelectorAll('[data-select]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedTicker = button.dataset.select;
        selectTicker(store, scenarioId, selectedTicker);
      });
    });
    container.querySelectorAll('[data-history-side]').forEach((button) => {
      button.addEventListener('click', () => {
        side = button.dataset.historySide;
        render(store.get());
      });
    });
    container.querySelector('#history-qty')?.addEventListener('input', (event) => {
      qty = event.target.value;
      refreshEstimate(store.get());
    });
    container.querySelector('#history-max')?.addEventListener('click', () => {
      const stateNow = store.get();
      const currentRun = run(stateNow);
      const quote = currentQuote(stateNow);
      if (!quote) return;
      const max = side === 'buy'
        ? Math.max(0, Math.floor((currentRun.account.cash - HISTORY_FEE) / quote.last))
        : (currentRun.account.positions[selectedTicker]?.qty || 0);
      qty = String(max);
      const input = container.querySelector('#history-qty');
      if (input) input.value = qty;
      refreshEstimate(store.get());
    });
    container.querySelector('#history-submit')?.addEventListener('click', () => {
      const est = estimate(store.get());
      if (est.error) {
        toast(est.error, 'warning');
        return;
      }
      const result = tradeHistory(store, scenarioId, dataset, { symbol: selectedTicker, side, qty: est.qty });
      if (!result.ok) {
        toast(i18n.t(result.error), 'warning');
        return;
      }
      toast(i18n.t(side === 'buy' ? 'history.buyToast' : 'history.sellToast', {
        qty: est.qty, symbol: selectedTicker, price: money(result.trade.price, i18n.locale),
      }), 'success');
    });
    container.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => router.go(button.dataset.go));
    });
    applyHistoryFilters();
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
    loadData();
  }

  function render(state) {
    if (!container) return;
    if (loading) {
      container.innerHTML = loadingPage();
      return;
    }
    if (loadError || !dataset || !scenario) {
      container.innerHTML = errorPage();
      container.querySelectorAll('[data-go]').forEach((button) => {
        button.addEventListener('click', () => router.go(button.dataset.go));
      });
      return;
    }
    const currentRun = run(state);
    if (!currentRun) {
      container.innerHTML = loadingPage();
      return;
    }
    container.innerHTML = template(state);
    bind(state);
    renderChart(state);
  }

  function destroy() {
    if (chart) chart.destroy();
    chart = null;
  }

  return {
    mount,
    render,
    onTick,
    onClockTick,
    onClockFastForward,
    destroy,
  };
}
