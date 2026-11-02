/**
 * Quant Lab: a standalone strategy backtest workbench plus a factor-research
 * ranking. It never mutates the trading account; results are teaching evidence,
 * not forecasts.
 */
import { LineChart } from '../chart.js';
import {
  money, num, pct, signedMoney,
} from '../../core/format.js';
import { pageHead, card, statCard } from '../kit.js';
import { icon } from '../icons.js';
import { formatMarketDate } from '../../market/calendar.js';
import { unlockedCompanies } from '../../market/marketAccess.js';
import { companyName, sectorLabel } from '../labels.js';
import { isUnitComplete } from '../../education/lessonEngine.js';
import {
  QUANT_STRATEGIES, QUANT_FACTOR_OPTIONS, QUANT_CASH_OPTIONS, QUANT_MIN_BARS,
  normalizeQuantConfig, runBacktest, factorResearch,
} from '../../quant/backtestEngine.js';

export function createQuantView(ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;
  let chart = null;
  let runToken = 0;
  let cachedResult = null;
  let cachedKey = '';
  let cachedFactor = null;
  let cachedFactorKey = '';

  function draft(state) {
    if (!root._quantDraft) root._quantDraft = normalizeQuantConfig(state.quant);
    return root._quantDraft;
  }

  function tickerOptions(state) {
    return unlockedCompanies(state);
  }

  function ensureTicker(state) {
    const config = draft(state);
    const options = tickerOptions(state);
    if (!options.some((company) => company.ticker === config.ticker)) {
      config.ticker = options[0]?.ticker || '';
    }
    return config;
  }

  function lockedCard(state) {
    return card({
      className: 'quant-locked',
      title: t('quant.lockedTitle'),
      subtitle: t('quant.lockedText'),
      body: `
        <p class="muted">${t('quant.lockedHint')}</p>
        <div class="button-row">
          <button class="btn btn--primary" type="button" data-go="/academy/u16">${icon('academy', { size: 15 })} ${t('quant.goAcademy')}</button>
        </div>`,
    });
  }

  function strategyCard(state) {
    const config = ensureTicker(state);
    const strategy = QUANT_STRATEGIES[config.strategy];
    const companies = tickerOptions(state);
    const strategies = Object.values(QUANT_STRATEGIES);
    return card({
      className: 'quant-config',
      title: t('quant.configTitle'),
      subtitle: t('quant.configSubtitle'),
      body: `
        <form data-quant-form>
          <div class="quant-form">
            <label class="field">
              <span class="field-label">${t('quant.tickerLabel')}</span>
              <select class="input input--select" name="ticker">
                ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === config.ticker ? 'selected' : ''}>${company.ticker} · ${companyName(ctx, company.ticker)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('quant.strategyLabel')}</span>
              <select class="input input--select" name="strategy">
                ${strategies.map((entry) => `<option value="${entry.id}" ${entry.id === config.strategy ? 'selected' : ''}>${t(entry.nameKey)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('quant.cashLabel')}</span>
              <select class="input input--select" name="initialCash">
                ${QUANT_CASH_OPTIONS.map((value) => `<option value="${value}" ${value === config.initialCash ? 'selected' : ''}>${money(value, i18n.locale)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('quant.commissionLabel')}</span>
              <input class="input" type="number" name="commission" min="0" max="10" step="1" value="${config.commission}" inputmode="numeric">
            </label>
            ${strategy.params.map((definition) => `
              <label class="field">
                <span class="field-label">${t(definition.labelKey)}</span>
                <input class="input" type="number" data-param="${definition.id}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${config.params[definition.id] ?? definition.default}" inputmode="decimal">
              </label>`).join('')}
            <label class="field">
              <span class="field-label">${t('quant.factorLabel')}</span>
              <select class="input input--select" name="factor">
                ${QUANT_FACTOR_OPTIONS.map((factor) => `<option value="${factor.id}" ${factor.id === config.factor ? 'selected' : ''}>${t(factor.nameKey)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('quant.factorLookbackLabel')}</span>
              <input class="input" type="number" name="factorLookback" min="20" max="250" step="1" value="${config.factorLookback}" inputmode="numeric">
            </label>
          </div>
          <div class="button-row">
            <button class="btn btn--primary" type="submit">${icon('play', { size: 15 })} ${t('quant.run')}</button>
          </div>
          <p class="field-hint">${t(strategy.descKey)}</p>
        </form>`,
    });
  }

  function statGrid(result) {
    const metrics = result.metrics;
    return `
      <div class="stat-grid">
        ${statCard({
          label: t('quant.stats.totalReturn'),
          value: pct(metrics.totalReturnPct, i18n.locale, 2),
          sub: t('quant.stats.benchmark', { value: pct(metrics.benchmarkReturnPct, i18n.locale, 2) }),
          tone: metrics.totalReturnPct >= 0 ? 'up' : 'down',
          iconName: 'trading',
        })}
        ${statCard({
          label: t('quant.stats.cagr'),
          value: pct(metrics.cagrPct, i18n.locale, 2),
          sub: t('quant.stats.excess', { value: pct(metrics.excessReturnPct, i18n.locale, 2) }),
          tone: metrics.cagrPct >= 0 ? 'up' : 'down',
          iconName: 'roadmap',
        })}
        ${statCard({
          label: t('quant.stats.maxDrawdown'),
          value: pct(metrics.maxDrawdownPct, i18n.locale, 2, false),
          sub: t('quant.stats.finalEquity', { value: money(metrics.finalEquity, i18n.locale) }),
          tone: metrics.maxDrawdownPct > 0 ? 'down' : '',
          iconName: 'warning',
        })}
        ${statCard({
          label: t('quant.stats.sharpe'),
          value: num(metrics.sharpe, i18n.locale, 2),
          sub: t('quant.stats.volatility', { value: pct(metrics.volatilityPct, i18n.locale, 1, false) }),
          iconName: 'sparkle',
        })}
        ${statCard({
          label: t('quant.stats.winRate'),
          value: pct(metrics.winRatePct, i18n.locale, 1, false),
          sub: t('quant.stats.trades', { count: metrics.trades }),
          iconName: 'check',
        })}
        ${statCard({
          label: t('quant.stats.exposure'),
          value: pct(metrics.exposurePct, i18n.locale, 1, false),
          sub: metrics.openPosition ? t('quant.stats.openPosition') : t('quant.stats.flat'),
          iconName: 'portfolio',
        })}
      </div>`;
  }

  function chartCard(result) {
    return card({
      className: 'quant-chart',
      title: t('quant.chartTitle'),
      subtitle: t('quant.chartSubtitle'),
      body: `
        <div class="chart-wrap"><canvas id="quant-equity-chart" style="height:250px"></canvas></div>
        <p class="chart-note muted">${t('quant.chartNote')}</p>`,
    });
  }

  function tradesCard(result) {
    const rows = result.trades.slice(-10).reverse();
    return card({
      className: 'quant-trades',
      title: t('quant.tradesTitle'),
      subtitle: t('quant.tradesSubtitle', { count: result.trades.length }),
      body: rows.length
        ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr>
              <th>#</th><th>${t('quant.trade.entry')}</th><th>${t('quant.trade.exit')}</th>
              <th class="num">${t('quant.trade.qty')}</th><th class="num">${t('quant.trade.pnl')}</th>
              <th class="num">${t('quant.trade.return')}</th><th class="num">${t('quant.trade.bars')}</th>
            </tr></thead>
            <tbody>${rows.map((trade, index) => `
              <tr>
                <td class="num">${result.trades.length - index}</td>
                <td>${formatMarketDate(result.equityCurve[trade.entryIndex]?.day ?? 0, i18n.locale)} · ${money(trade.entryPrice, i18n.locale)}</td>
                <td>${trade.open ? t('quant.trade.stillOpen') : `${formatMarketDate(result.equityCurve[trade.exitIndex]?.day ?? 0, i18n.locale)} · ${money(trade.exitPrice, i18n.locale)}`}</td>
                <td class="num">${num(trade.qty, i18n.locale, 0)}</td>
                <td class="num ${trade.pnl >= 0 ? 'up' : 'down'}">${signedMoney(trade.pnl, i18n.locale)}</td>
                <td class="num ${trade.returnPct >= 0 ? 'up' : 'down'}">${pct(trade.returnPct, i18n.locale, 2)}</td>
                <td class="num">${trade.barsHeld}</td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('quant.tradesEmpty')}</p>`,
    });
  }

  function factorCard(state) {
    const config = draft(state);
    const factorKey = `${config.factor}:${config.factorLookback}:${state.market.day}`;
    if (factorKey !== cachedFactorKey) {
      cachedFactor = factorResearch(state, {
        factor: config.factor,
        lookback: config.factorLookback,
      });
      cachedFactorKey = factorKey;
    }
    const factor = cachedFactor;
    const selected = QUANT_FACTOR_OPTIONS.find((entry) => entry.id === factor.factor)
      || QUANT_FACTOR_OPTIONS[0];
    const metric = (row) => {
      if (factor.factor === 'value') return row.metric ? `${num(row.metric, i18n.locale, 1)}×` : '—';
      return pct(row.metric, i18n.locale, 1);
    };
    return card({
      className: 'quant-factor',
      title: t('quant.factorTitle'),
      subtitle: t('quant.factorSubtitle', { count: factor.count, days: factor.lookback }),
      body: `
        <p class="muted">${t(selected.descKey)}</p>
        ${factor.rows.length
          ? `<div class="table-wrap"><table class="table table--compact">
              <thead><tr>
                <th>#</th><th>${t('quant.factor.ticker')}</th><th>${t('quant.factor.sector')}</th>
                <th class="num">${t('quant.factor.metric')}</th>
              </tr></thead>
              <tbody>${factor.rows.slice(0, 8).map((row) => `
                <tr>
                  <td class="num">${row.rank}</td>
                  <td><strong class="mono">${row.ticker}</strong> · ${companyName(ctx, row.ticker)}</td>
                  <td class="muted">${sectorLabel(ctx, row.sector)}</td>
                  <td class="num">${metric(row)}</td>
                </tr>`).join('')}</tbody>
            </table></div>
            <p class="chart-note muted">${t('quant.factor.note')}</p>`
          : `<p class="muted">${t('quant.factor.empty')}</p>`}`,
    });
  }

  function resultBody(state) {
    const config = ensureTicker(state);
    const candles = state.market.history[config.ticker] || [];
    const key = `${config.ticker}:${config.strategy}:${JSON.stringify(config.params)}:${config.initialCash}:${config.commission}:${candles.length}:${runToken}`;
    if (key !== cachedKey) {
      cachedResult = runBacktest({
        candles,
        strategy: config.strategy,
        params: config.params,
        initialCash: config.initialCash,
        commission: config.commission,
      });
      cachedKey = key;
    }
    if (!cachedResult.ok) {
      return card({
        className: 'quant-result',
        title: t('quant.resultTitle'),
        body: `<p class="muted">${t(cachedResult.error, { min: QUANT_MIN_BARS })}</p>`,
      });
    }
    const result = cachedResult;
    return `
      ${statGrid(result)}
      ${chartCard(result)}
      ${tradesCard(result)}
      <p class="chart-note muted">${t('quant.disclaimer')}</p>`;
  }

  function template(state) {
    const unlocked = isUnitComplete(state, 'u16');
    return `
      <div class="quant-page">
        ${pageHead({
          eyebrow: t('quant.eyebrow'),
          title: t('quant.title'),
          subtitle: t('quant.subtitle'),
          actions: `<span class="pill">${icon('trading', { size: 14 })} ${t('quant.pill')}</span>`,
        })}
        ${!unlocked
          ? lockedCard(state)
          : `${strategyCard(state)}<div class="quant-result-shell">${resultBody(state)}</div>${factorCard(state)}`}
        <p class="chart-note muted">${t('quant.note')}</p>
      </div>`;
  }

  function destroyChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  function updateChart() {
    destroyChart();
    if (!cachedResult?.ok) return;
    const canvas = container?.querySelector('#quant-equity-chart');
    if (!canvas) return;
    chart = new LineChart(canvas, {
      height: 250,
      showYAxis: true,
      yFormat: (value) => money(value, i18n.locale, 0),
      color: '#5eead4',
    });
    chart.setData({ values: cachedResult.equityCurve.map((point) => point.equity) });
  }

  function captureDraft(form) {
    const config = draft(store.get());
    config.ticker = form.querySelector('[name="ticker"]')?.value || config.ticker;
    config.strategy = form.querySelector('[name="strategy"]')?.value || config.strategy;
    config.initialCash = Number(form.querySelector('[name="initialCash"]')?.value) || config.initialCash;
    config.commission = Number(form.querySelector('[name="commission"]')?.value) || 0;
    config.factor = form.querySelector('[name="factor"]')?.value || config.factor;
    config.factorLookback = Number(form.querySelector('[name="factorLookback"]')?.value) || config.factorLookback;
    form.querySelectorAll('[data-param]').forEach((input) => {
      config.params[input.dataset.param] = Number(input.value);
    });
    root._quantDraft = normalizeQuantConfig(config);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-quant-form]')) return;
      event.preventDefault();
      captureDraft(event.target);
      runToken += 1;
      const config = draft(store.get());
      actions.setQuantConfig(config);
      render(store.get());
    });
    root.addEventListener('change', (event) => {
      const form = event.target.closest('[data-quant-form]');
      if (!form) return;
      captureDraft(form);
      if (event.target.matches('[name="strategy"], [name="ticker"], [name="factor"], [name="factorLookback"]')) {
        render(store.get());
      }
    });
    root.addEventListener('input', (event) => {
      const form = event.target.closest('[data-quant-form]');
      if (!form) return;
      captureDraft(form);
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    updateChart();
  }

  function destroy() {
    destroyChart();
  }

  return { mount, render, destroy };
}
