/**
 * Quant Lab: standalone backtests, parameter optimisation with an out-of-sample
 * check, and a small cross-sectional logistic model for stock selection.
 * Nothing on this page mutates the simulated trading account.
 */
import { LineChart } from '../chart.js';
import {
  money, num, pct, signedMoney,
} from '../../core/format.js';
import { pageHead, card, statCard, keyValueList } from '../kit.js';
import { icon } from '../icons.js';
import { formatMarketDate } from '../../market/calendar.js';
import { unlockedCompanies } from '../../market/marketAccess.js';
import { companyName, sectorLabel } from '../labels.js';
import { isUnitComplete } from '../../education/lessonEngine.js';
import {
  QUANT_STRATEGIES, QUANT_FACTOR_OPTIONS, QUANT_CASH_OPTIONS, QUANT_MIN_BARS,
  QUANT_MODES, QUANT_OBJECTIVES, ML_FACTORS,
  normalizeQuantConfig, runBacktest, factorResearch, optimizeStrategy, mlStockSelection,
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
  let cachedOptimize = null;
  let cachedOptimizeKey = '';
  let cachedMl = null;
  let cachedMlKey = '';
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

  function modeDef(config) {
    return QUANT_MODES.find((entry) => entry.id === config.mode) || QUANT_MODES[0];
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

  function modeBar(config) {
    const mode = modeDef(config);
    return `
      <div class="quant-modebar">
        <div class="segmented quant-modes">
          ${QUANT_MODES.map((entry) => `<button class="segmented__item ${entry.id === config.mode ? 'is-active' : ''}" type="button" data-quant-mode="${entry.id}">${t(entry.nameKey)}</button>`).join('')}
        </div>
        <p class="field-hint">${t(mode.descKey)}</p>
      </div>`;
  }

  function field(label, input) {
    return `
      <label class="field">
        <span class="field-label">${label}</span>
        ${input}
      </label>`;
  }

  function tickerField(state, config) {
    return field(t('quant.tickerLabel'), `
      <select class="input input--select" name="ticker">
        ${tickerOptions(state).map((company) => `<option value="${company.ticker}" ${company.ticker === config.ticker ? 'selected' : ''}>${company.ticker} · ${companyName(ctx, company.ticker)}</option>`).join('')}
      </select>`);
  }

  function strategyField(config) {
    return field(t('quant.strategyLabel'), `
      <select class="input input--select" name="strategy">
        ${Object.values(QUANT_STRATEGIES).map((entry) => `<option value="${entry.id}" ${entry.id === config.strategy ? 'selected' : ''}>${t(entry.nameKey)}</option>`).join('')}
      </select>`);
  }

  function cashField(config) {
    return field(t('quant.cashLabel'), `
      <select class="input input--select" name="initialCash">
        ${QUANT_CASH_OPTIONS.map((value) => `<option value="${value}" ${value === config.initialCash ? 'selected' : ''}>${money(value, i18n.locale)}</option>`).join('')}
      </select>`);
  }

  function commissionField(config) {
    return field(t('quant.commissionLabel'), `<input class="input" type="number" name="commission" min="0" max="10" step="1" value="${config.commission}" inputmode="numeric">`);
  }

  function configCard(state) {
    let config = draft(state);
    const mode = config.mode;
    if (mode === 'backtest' || mode === 'optimize') config = ensureTicker(state);
    const strategy = QUANT_STRATEGIES[config.strategy];
    let fields = '';
    if (mode === 'backtest') {
      fields = `
        ${tickerField(state, config)}
        ${strategyField(config)}
        ${cashField(config)}
        ${commissionField(config)}
        ${strategy.params.map((definition) => field(t(definition.labelKey), `
          <input class="input" type="number" data-param="${definition.id}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${config.params[definition.id] ?? definition.default}" inputmode="decimal">`)).join('')}
        ${field(t('quant.factorLabel'), `
          <select class="input input--select" name="factor">
            ${QUANT_FACTOR_OPTIONS.map((factor) => `<option value="${factor.id}" ${factor.id === config.factor ? 'selected' : ''}>${t(factor.nameKey)}</option>`).join('')}
          </select>`)}
        ${field(t('quant.factorLookbackLabel'), `<input class="input" type="number" name="factorLookback" min="20" max="250" step="1" value="${config.factorLookback}" inputmode="numeric">`)}`;
    } else if (mode === 'optimize') {
      fields = `
        ${tickerField(state, config)}
        ${strategyField(config)}
        ${cashField(config)}
        ${commissionField(config)}
        ${field(t('quant.objectiveLabel'), `
          <select class="input input--select" name="objective">
            ${QUANT_OBJECTIVES.map((objective) => `<option value="${objective.id}" ${objective.id === config.objective ? 'selected' : ''}>${t(objective.nameKey)}</option>`).join('')}
          </select>`)}
        ${field(t('quant.splitLabel'), `<input class="input" type="number" name="splitPct" min="50" max="90" step="1" value="${config.splitPct}" inputmode="numeric">`)}`;
    } else {
      fields = `
        ${field(t('quant.ml.lookbackLabel'), `<input class="input" type="number" name="mlLookback" min="20" max="50" step="1" value="${config.mlLookback}" inputmode="numeric">`)}
        ${field(t('quant.ml.horizonLabel'), `<input class="input" type="number" name="mlHorizon" min="5" max="30" step="1" value="${config.mlHorizon}" inputmode="numeric">`)}
        ${field(t('quant.ml.topNLabel'), `<input class="input" type="number" name="mlTopN" min="3" max="10" step="1" value="${config.mlTopN}" inputmode="numeric">`)}
        ${field(t('quant.ml.testPctLabel'), `<input class="input" type="number" name="mlTestPct" min="20" max="50" step="1" value="${config.mlTestPct}" inputmode="numeric">`)}`;
    }
    const runKey = mode === 'optimize' ? 'quant.runOptimize' : mode === 'ml' ? 'quant.runMl' : 'quant.run';
    return card({
      className: 'quant-config',
      title: t('quant.configTitle'),
      subtitle: mode === 'ml' ? t('quant.ml.configSubtitle') : t('quant.configSubtitle'),
      body: `
        <form data-quant-form>
          <div class="quant-form">${fields}</div>
          <div class="button-row">
            <button class="btn btn--primary" type="submit">${icon('play', { size: 15 })} ${t(runKey)}</button>
          </div>
          <p class="field-hint">${mode === 'optimize' ? t('quant.opt.gridNote') : mode === 'ml' ? t('quant.ml.configNote') : t(strategy.descKey)}</p>
        </form>`,
    });
  }

  function backtestStatGrid(result) {
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

  function chartCard({ id, title, subtitle, note }) {
    return card({
      className: 'quant-chart',
      title,
      subtitle,
      body: `
        <div class="chart-wrap"><canvas id="${id}" style="height:250px"></canvas></div>
        <p class="chart-note muted">${note}</p>`,
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

  function backtestBody(state) {
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
      ${backtestStatGrid(result)}
      ${chartCard({
        id: 'quant-equity-chart',
        title: t('quant.chartTitle'),
        subtitle: t('quant.chartSubtitle'),
        note: t('quant.chartNote'),
      })}
      ${tradesCard(result)}
      <p class="chart-note muted">${t('quant.disclaimer')}</p>`;
  }

  function optimizeBody(state) {
    const config = ensureTicker(state);
    const candles = state.market.history[config.ticker] || [];
    const key = `${config.ticker}:${config.strategy}:${JSON.stringify(config.params)}:${config.initialCash}:${config.commission}:${config.splitPct}:${config.objective}:${candles.length}:${runToken}`;
    if (key !== cachedOptimizeKey) {
      cachedOptimize = optimizeStrategy({
        candles,
        strategy: config.strategy,
        baseParams: config.params,
        initialCash: config.initialCash,
        commission: config.commission,
        splitPct: config.splitPct,
        objective: config.objective,
      });
      cachedOptimizeKey = key;
    }
    const result = cachedOptimize;
    if (!result.ok) {
      return card({
        className: 'quant-result',
        title: t('quant.opt.resultTitle'),
        body: `<p class="muted">${t(result.error, { min: QUANT_MIN_BARS * 2 })}</p>`,
      });
    }
    const inMetrics = result.best.inSample;
    const outMetrics = result.outSample?.metrics;
    const baseline = result.baselineOut?.metrics;
    return `
      <div class="quant-mode-result">
        <div class="stat-grid">
          ${statCard({ label: t('quant.opt.inSampleReturn'), value: pct(inMetrics.totalReturnPct, i18n.locale, 2), sub: t('quant.opt.inSharpe', { value: num(inMetrics.sharpe, i18n.locale, 2) }), tone: inMetrics.totalReturnPct >= 0 ? 'up' : 'down', iconName: 'trading' })}
          ${statCard({ label: t('quant.opt.outSampleReturn'), value: outMetrics ? pct(outMetrics.totalReturnPct, i18n.locale, 2) : '—', sub: outMetrics ? t('quant.opt.outSharpe', { value: num(outMetrics.sharpe, i18n.locale, 2) }) : '', tone: outMetrics && outMetrics.totalReturnPct >= 0 ? 'up' : 'down', iconName: 'roadmap' })}
          ${statCard({ label: t('quant.opt.outDrawdown'), value: outMetrics ? pct(outMetrics.maxDrawdownPct, i18n.locale, 2, false) : '—', sub: t('quant.opt.split', { value: result.splitPct }), tone: outMetrics && outMetrics.maxDrawdownPct > 0 ? 'down' : '', iconName: 'warning' })}
          ${statCard({ label: t('quant.opt.baseline'), value: baseline ? pct(baseline.totalReturnPct, i18n.locale, 2) : '—', sub: t('quant.opt.pickCount', { count: result.comboCount }), tone: baseline && baseline.totalReturnPct >= 0 ? 'up' : 'down', iconName: 'sparkle' })}
        </div>
        ${result.overfitRisk
          ? `<p class="fund-warning">${icon('warning', { size: 14 })} ${t('quant.opt.overfitWarning')}</p>`
          : `<p class="muted fund-hint">${t('quant.opt.overfitClear')}</p>`}
        ${card({
    title: t('quant.opt.bestTitle'),
    subtitle: t('quant.opt.bestSubtitle'),
    body: `${keyValueList(Object.entries(result.best.params).map(([key, value]) => [t(`quant.param.${key}`), String(value)]))}
      <p class="chart-note muted">${t('quant.opt.bestNote')}</p>`,
  })}
        ${card({
    title: t('quant.opt.tableTitle'),
    subtitle: t('quant.opt.tableSubtitle', { count: result.comboCount }),
    body: `<div class="table-wrap"><table class="table table--compact">
      <thead><tr><th>#</th><th>${t('quant.opt.params')}</th><th class="num">${t('quant.opt.inReturn')}</th><th class="num">${t('quant.stats.sharpe')}</th><th class="num">${t('quant.opt.score')}</th></tr></thead>
      <tbody>${result.candidates.map((candidate, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td class="mono">${Object.entries(candidate.params).map(([key, value]) => `${key} ${value}`).join(' · ') || '—'}</td>
          <td class="num ${candidate.inSample.totalReturnPct >= 0 ? 'up' : 'down'}">${pct(candidate.inSample.totalReturnPct, i18n.locale, 2)}</td>
          <td class="num">${num(candidate.inSample.sharpe, i18n.locale, 2)}</td>
          <td class="num">${num(candidate.score, i18n.locale, 2)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`,
  })}
        ${result.outSample ? chartCard({
    id: 'quant-equity-chart',
    title: t('quant.opt.chartTitle'),
    subtitle: t('quant.opt.chartSubtitle'),
    note: t('quant.opt.chartNote'),
  }) : ''}
        <p class="chart-note muted">${t('quant.opt.disclaimer')}</p>
      </div>`;
  }

  function mlBody(state) {
    const config = draft(state);
    const key = `${config.mlLookback}:${config.mlHorizon}:${config.mlTopN}:${config.mlTestPct}:${state.market.day}:${runToken}`;
    if (key !== cachedMlKey) {
      cachedMl = mlStockSelection(state, {
        lookback: config.mlLookback,
        horizon: config.mlHorizon,
        topN: config.mlTopN,
        testPct: config.mlTestPct,
      });
      cachedMlKey = key;
    }
    const result = cachedMl;
    if (!result.ok) {
      return card({
        className: 'quant-result',
        title: t('quant.ml.resultTitle'),
        body: `<p class="muted">${t(result.error)}</p>`,
      });
    }
    const portfolio = result.portfolio;
    return `
      <div class="stat-grid">
        ${statCard({ label: t('quant.ml.topReturn'), value: pct(portfolio.totalReturnPct, i18n.locale, 2), sub: t('quant.ml.benchmark', { value: pct(portfolio.benchmarkReturnPct, i18n.locale, 2) }), tone: portfolio.totalReturnPct >= 0 ? 'up' : 'down', iconName: 'trading' })}
        ${statCard({ label: t('quant.ml.excess'), value: pct(portfolio.excessReturnPct, i18n.locale, 2), sub: t('quant.ml.hitRate', { value: pct(portfolio.hitRatePct, i18n.locale, 1, false) }), tone: portfolio.excessReturnPct >= 0 ? 'up' : 'down', iconName: 'sparkle' })}
        ${statCard({ label: t('quant.ml.testAccuracy'), value: pct(result.model.testAccuracy * 100, i18n.locale, 1, false), sub: t('quant.ml.trainAccuracy', { value: pct(result.model.accuracy * 100, i18n.locale, 1, false) }), iconName: 'check' })}
        ${statCard({ label: t('quant.ml.rebalances'), value: num(portfolio.rebalances, i18n.locale, 0), sub: t('quant.ml.avgExcess', { value: pct(portfolio.avgExcessPct, i18n.locale, 2) }), iconName: 'roadmap' })}
      </div>
      ${result.overfitRisk
        ? `<p class="fund-warning">${icon('warning', { size: 14 })} ${t('quant.ml.overfitWarning')}</p>`
        : `<p class="muted fund-hint">${t('quant.ml.overfitClear')}</p>`}
      ${card({
    title: t('quant.ml.modelTitle'),
    subtitle: t('quant.ml.modelSubtitle', {
      train: result.trainSamples, test: result.testSamples,
    }),
    body: `${keyValueList([
      [t('quant.ml.intercept'), num(result.model.intercept, i18n.locale, 3)],
      ...ML_FACTORS.map((factor) => [t(`quant.factor.${factor}`), num(result.model.coefficients[factor], i18n.locale, 3)]),
      [t('quant.ml.splitDate'), formatMarketDate(result.splitDate, i18n.locale)],
    ])}
      <p class="chart-note muted">${t('quant.ml.modelNote')}</p>`,
  })}
      ${card({
    title: t('quant.ml.picksTitle'),
    subtitle: t('quant.ml.picksSubtitle', { count: result.picks.length, top: result.topN }),
    body: `<div class="table-wrap"><table class="table table--compact">
      <thead><tr><th>${t('quant.ml.date')}</th><th>${t('quant.ml.picks')}</th><th class="num">${t('quant.ml.pickReturn')}</th><th class="num">${t('quant.ml.universeReturn')}</th><th class="num">${t('quant.ml.excess')}</th></tr></thead>
      <tbody>${result.picks.map((pick) => `
        <tr>
          <td>${formatMarketDate(pick.date, i18n.locale)}</td>
          <td class="mono">${pick.tickers.join(' · ')}</td>
          <td class="num ${pick.topReturn >= 0 ? 'up' : 'down'}">${pct(pick.topReturn, i18n.locale, 2)}</td>
          <td class="num ${pick.universeReturn >= 0 ? 'up' : 'down'}">${pct(pick.universeReturn, i18n.locale, 2)}</td>
          <td class="num ${pick.excess >= 0 ? 'up' : 'down'}">${pct(pick.excess, i18n.locale, 2)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`,
  })}
      ${chartCard({
    id: 'quant-ml-chart',
    title: t('quant.ml.chartTitle'),
    subtitle: t('quant.ml.chartSubtitle'),
    note: t('quant.ml.chartNote'),
  })}
      <p class="chart-note muted">${t('quant.ml.disclaimer')}</p>`;
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

  function template(state) {
    const unlocked = isUnitComplete(state, 'u16');
    const config = draft(state);
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
    : `${modeBar(config)}${configCard(state)}
        ${config.mode === 'backtest' ? backtestBody(state) : config.mode === 'optimize' ? optimizeBody(state) : mlBody(state)}
        ${config.mode === 'backtest' ? factorCard(state) : ''}`}
        <p class="chart-note muted">${t('quant.note')}</p>
      </div>`;
  }

  function destroyChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  function makeChart(canvasId, values, formatter) {
    const canvas = container?.querySelector(`#${canvasId}`);
    if (!canvas) return;
    chart = new LineChart(canvas, {
      height: 250,
      showYAxis: true,
      yFormat: formatter,
      color: '#5eead4',
    });
    chart.setData({ values });
  }

  function updateChart() {
    destroyChart();
    if (cachedResult?.ok && container?.querySelector('#quant-equity-chart') && draft(store.get()).mode === 'backtest') {
      makeChart('quant-equity-chart', cachedResult.equityCurve.map((point) => point.equity), (value) => money(value, i18n.locale, 0));
    } else if (cachedOptimize?.ok && container?.querySelector('#quant-equity-chart') && draft(store.get()).mode === 'optimize') {
      const values = cachedOptimize.outSample?.equityCurve.map((point) => point.equity) || [];
      makeChart('quant-equity-chart', values, (value) => money(value, i18n.locale, 0));
    } else if (cachedMl?.ok && container?.querySelector('#quant-ml-chart')) {
      makeChart('quant-ml-chart', cachedMl.curve.map((point) => point.top), (value) => `${num(value * 100, i18n.locale, 1)}`);
    }
  }

  function captureDraft(form) {
    const config = draft(store.get());
    const value = (name) => form.querySelector(`[name="${name}"]`)?.value;
    if (value('ticker')) config.ticker = value('ticker');
    if (value('strategy')) config.strategy = value('strategy');
    if (value('initialCash')) config.initialCash = Number(value('initialCash'));
    if (value('commission') !== undefined) config.commission = Number(value('commission'));
    if (value('factor')) config.factor = value('factor');
    if (value('factorLookback')) config.factorLookback = Number(value('factorLookback'));
    if (value('objective')) config.objective = value('objective');
    if (value('splitPct')) config.splitPct = Number(value('splitPct'));
    if (value('mlLookback')) config.mlLookback = Number(value('mlLookback'));
    if (value('mlHorizon')) config.mlHorizon = Number(value('mlHorizon'));
    if (value('mlTopN')) config.mlTopN = Number(value('mlTopN'));
    if (value('mlTestPct')) config.mlTestPct = Number(value('mlTestPct'));
    form.querySelectorAll('[data-param]').forEach((input) => {
      config.params[input.dataset.param] = Number(input.value);
    });
    root._quantDraft = normalizeQuantConfig(config);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-quant-mode]');
      if (!mode) return;
      const config = draft(store.get());
      config.mode = mode.dataset.quantMode;
      root._quantDraft = normalizeQuantConfig(config);
      runToken += 1;
      actions.setQuantConfig(root._quantDraft);
      render(store.get());
    });
    root.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-quant-form]')) return;
      event.preventDefault();
      captureDraft(event.target);
      runToken += 1;
      actions.setQuantConfig(draft(store.get()));
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
