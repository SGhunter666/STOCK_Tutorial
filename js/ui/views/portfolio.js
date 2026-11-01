/**
 * Portfolio: equity, allocation, holdings and realized results.
 */
import { money, pct, num, signedMoney } from '../../core/format.js';
import { pageHead, card, statCard } from '../kit.js';
import { emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { LineChart } from '../chart.js';
import { portfolioSummary, sectorAllocation } from '../../trading/portfolio.js';
import { dividendIncome } from '../../market/dividends.js';
import { portfolioAnalytics } from '../../trading/analytics.js';
import { marginStatus } from '../../trading/margin.js';
import { COMPANIES } from '../../data/companies.js';
import { formatMarketDate } from '../../market/calendar.js';
import { companyName, sectorLabel, POSITION_COLORS } from '../labels.js';

const COMPANY_MAP = COMPANIES.reduce((acc, company) => {
  acc[company.ticker] = company;
  return acc;
}, {});

export function createPortfolioView(ctx) {
  const { i18n, store, router } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;
  let chart = null;

  function summaryCards(summary, state) {
    return `
      ${statCard({
        label: t('portfolio.equity'),
        value: money(summary.total, i18n.locale),
        sub: t('portfolio.equitySub'),
        iconName: 'portfolio',
        id: 'pf-equity',
      })}
      ${statCard({
        label: t('portfolio.cash'),
        value: money(summary.cash, i18n.locale),
        sub: t('portfolio.cashSub'),
        iconName: 'glossary',
        id: 'pf-cash',
      })}
      ${statCard({
        label: t('portfolio.holdingsValue'),
        value: money(summary.holdingsValue, i18n.locale),
        sub: t('portfolio.holdingsSub'),
        iconName: 'market',
        id: 'pf-holdings',
      })}
      ${statCard({
        label: t('portfolio.unrealized'),
        value: signedMoney(summary.unrealized, i18n.locale),
        sub: t('portfolio.unrealizedSub'),
        tone: summary.unrealized > 0 ? 'up' : summary.unrealized < 0 ? 'down' : '',
        iconName: 'options',
        id: 'pf-unreal',
      })}
      ${statCard({
        label: t('portfolio.realized'),
        value: signedMoney(summary.realized, i18n.locale),
        sub: t('portfolio.realizedSub'),
        tone: summary.realized > 0 ? 'up' : summary.realized < 0 ? 'down' : '',
        iconName: 'trading',
        id: 'pf-realized',
      })}
      ${statCard({
        label: t('portfolio.return'),
        value: pct(summary.returnPct, i18n.locale, 2),
        sub: money(summary.totalPnl, i18n.locale),
        tone: summary.totalPnl > 0 ? 'up' : summary.totalPnl < 0 ? 'down' : '',
        iconName: 'academy',
        id: 'pf-return',
      })}`;
  }

  function allocationCard(summary) {
    const segments = summary.rows.map((row, index) => ({
      label: row.ticker,
      name: companyName(ctx, row.ticker),
      value: row.value,
      weight: row.weight,
      color: POSITION_COLORS[index % POSITION_COLORS.length],
    }));
    segments.push({ label: t('portfolio.cash'), name: t('portfolio.cash'), value: summary.cash, weight: summary.cashWeight, color: 'rgba(148,163,184,0.55)' });
    const sectorRows = sectorAllocation(summary.rows, COMPANY_MAP);
    return card({
      title: t('portfolio.allocationTitle'),
      subtitle: t('portfolio.allocationSubtitle'),
      body: summary.rows.length === 0 && summary.cash === 0
        ? `<p class="muted">${t('portfolio.noAllocation')}</p>`
        : `
        <div class="allocation-bar">
          ${segments.filter((s) => s.weight > 0).map((s) => `<span class="allocation-bar__seg" style="width:${s.weight}%;background:${s.color}" title="${s.name} ${s.weight.toFixed(1)}%"></span>`).join('')}
        </div>
        <div class="allocation-legend">
          ${segments.filter((s) => s.weight > 0).map((s) => `
            <div class="legend-row">
              <span class="legend-dot" style="background:${s.color}"></span>
              <span class="legend-row__label">${s.label} <span class="muted">${s.name}</span></span>
              <span class="legend-row__value">${money(s.value, i18n.locale)}</span>
              <span class="legend-row__pct">${pct(s.weight, i18n.locale, 1, false)}</span>
            </div>`).join('')}
        </div>
        ${summary.rows.length ? `
        <div class="sector-strip">
          <span class="field-label">${t('portfolio.sectorTitle')}</span>
          ${sectorRows.map((row, index) => `<span class="chip">${sectorLabel(ctx, row.sector)} · ${pct(row.weight, i18n.locale, 1, false)}</span>`).join('')}
        </div>` : ''}`,
    });
  }

  function holdingsCard(summary, state) {
    if (!summary.rows.length) {
      return card({
        title: t('portfolio.holdingsTitle'),
        body: emptyState(icon('market', { size: 26 }), t('portfolio.emptyTitle'), t('portfolio.emptyText'),
          `<button class="btn btn--primary btn--sm" type="button" data-go="/market">${t('portfolio.browseMarket')}</button>`),
      });
    }
    return card({
      title: t('portfolio.holdingsTitle'),
      subtitle: t('portfolio.holdingsCount', { count: summary.rows.length }),
      body: `
        <div class="table-wrap">
          <table class="table holdings-table">
            <thead><tr>
              <th>${t('trade.ticker')}</th><th>${t('portfolio.qty')}</th><th>${t('portfolio.avgCost')}</th>
              <th>${t('market.last')}</th><th>${t('portfolio.value')}</th><th>${t('portfolio.weight')}</th>
              <th>${t('portfolio.pnl')}</th><th></th>
            </tr></thead>
            <tbody>
              ${summary.rows.map((row) => `
                <tr data-row="${row.ticker}">
                  <td><span class="ticker-cell"><strong>${row.ticker}</strong><span>${companyName(ctx, row.ticker)}${row.side === 'short' ? ` · ${t('trade.short')}` : ''}</span></span></td>
                  <td class="num">${num(row.qty, i18n.locale, 0)}</td>
                  <td class="num">${money(row.avgCost, i18n.locale)}</td>
                  <td class="num" data-cell="last">${money(row.last, i18n.locale)}</td>
                  <td class="num" data-cell="value">${money(row.value, i18n.locale)}</td>
                  <td class="num" data-cell="weight">${pct(row.weight, i18n.locale, 1, false)}</td>
                  <td class="num" data-cell="pnl"><span class="${row.pnl > 0 ? 'up' : row.pnl < 0 ? 'down' : 'flat'}">${signedMoney(row.pnl, i18n.locale)} · ${pct(row.pnlPct, i18n.locale, 2)}</span></td>
                  <td><button class="link-btn" type="button" data-go="/trade/${row.ticker}">${t('portfolio.trade')}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`,
    });
  }

  function historyCard(state) {
    return card({
      title: t('portfolio.equityCurveTitle'),
      subtitle: t('portfolio.equityCurveSubtitle'),
      body: `<div class="chart-wrap"><canvas id="portfolio-chart" style="height:240px"></canvas></div>
        <p class="chart-note muted">${t('portfolio.equityCurveNote')}</p>`,
    });
  }

  function tradesCard(state) {
    const trades = state.account.trades.slice(0, 15);
    return card({
      title: t('portfolio.tradesTitle'),
      subtitle: t('portfolio.tradesSubtitle', { count: state.account.trades.length }),
      body: trades.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${t('trade.side')}</th><th>${t('trade.ticker')}</th><th>${t('trade.quantity')}</th><th>${t('trade.price')}</th><th>${t('trade.fee')}</th><th>${t('trade.realized')}</th><th>${t('trade.date')}</th></tr></thead>
            <tbody>
              ${trades.map((trade) => `<tr>
                <td><span class="side-tag side-tag--${trade.side}">${t(`trade.${trade.side}`)}</span></td>
                <td>${trade.ticker}</td>
                <td class="num">${num(trade.qty, i18n.locale, 0)}</td>
                <td class="num">${money(trade.price, i18n.locale)}</td>
                <td class="num">${money(trade.fee, i18n.locale)}</td>
                <td class="num ${trade.realized > 0 ? 'up' : trade.realized < 0 ? 'down' : ''}">${trade.side === 'sell' || trade.side === 'cover' ? signedMoney(trade.realized, i18n.locale) : '—'}</td>
                <td class="num">${formatMarketDate(trade.day, i18n.locale)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`
        : `<p class="muted">${t('portfolio.noTrades')}</p>`,
    });
  }

  function dividendsCard(state) {
    const rows = (state.account.dividends || []).slice(0, 10);
    const total = dividendIncome(state.account);
    return card({
      title: t('portfolio.dividendsTitle'),
      subtitle: t('portfolio.dividendsSubtitle', { total: money(total, i18n.locale) }),
      body: rows.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${t('trade.date')}</th><th>${t('trade.ticker')}</th><th class="num">${t('portfolio.dividendQty')}</th><th class="num">${t('portfolio.dividendPerShare')}</th><th class="num">${t('portfolio.dividendAmount')}</th></tr></thead>
            <tbody>${rows.map((row) => `
              <tr>
                <td>${formatMarketDate(row.day, i18n.locale)}</td>
                <td>${row.ticker}</td>
                <td class="num">${num(row.qty, i18n.locale, 0)}</td>
                <td class="num">${money(row.perShare, i18n.locale)}</td>
                <td class="num ${row.amount > 0 ? 'up' : 'down'}">${signedMoney(row.amount, i18n.locale)}</td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('portfolio.noDividends')}</p>`,
    });
  }

  function riskCard(state, summary) {
    const analytics = portfolioAnalytics(state.account, state.market.quotes, summary.total);
    const status = marginStatus(state.account, state.market.quotes);
    const marginRows = status.leveraged ? `
          <tr><td>${t('portfolio.marginDebt')}</td><td class="num">${money(status.debt, i18n.locale)}</td></tr>
          <tr><td>${t('portfolio.financingPaid')}</td><td class="num">${money(state.account.financingPaid || 0, i18n.locale)}</td></tr>
          <tr><td>${t('portfolio.marginCalls')}</td><td class="num">${num((state.account.marginCalls || []).length, i18n.locale, 0)}</td></tr>` : '';
    return card({
      title: t('portfolio.riskTitle'),
      subtitle: t('portfolio.riskSubtitle'),
      body: `
        <div class="table-wrap"><table class="table"><tbody>
          <tr><td>${t('portfolio.volatility')}</td><td class="num">${analytics.volatility === null ? '—' : pct(analytics.volatility, i18n.locale, 1, false)}</td></tr>
          <tr><td>${t('portfolio.drawdown')}</td><td class="num down">${analytics.drawdown === null ? '—' : pct(analytics.drawdown, i18n.locale, 1, false)}</td></tr>
          <tr><td>${t('portfolio.exposure')}</td><td class="num">${pct(analytics.exposure * 100, i18n.locale, 1, false)}</td></tr>
          <tr><td>${t('portfolio.topWeight')}</td><td class="num">${analytics.topTicker ? `${analytics.topTicker} · ${pct(analytics.topWeight * 100, i18n.locale, 1, false)}` : '—'}</td></tr>
          <tr><td>${t('portfolio.concentration')}</td><td class="num">${num(analytics.hhi, i18n.locale, 3)}</td></tr>
          ${marginRows}
        </tbody></table></div>
        <p class="muted">${analytics.samples < 3 ? t('portfolio.riskNoHistory') : t('portfolio.riskNote')}</p>`,
    });
  }

  function template(state) {
    const summary = portfolioSummary(state.account, state.market.quotes);
    return `
      <div class="portfolio-page">
        ${pageHead({
          eyebrow: t('portfolio.eyebrow'),
          title: t('portfolio.title'),
          subtitle: t('portfolio.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/market">${icon('market', { size: 15 })} ${t('nav.market')}</button>`,
        })}
        <div class="stat-grid stat-grid--six">${summaryCards(summary, state)}</div>
        ${allocationCard(summary)}
        ${riskCard(state, summary)}
        ${holdingsCard(summary, state)}
        ${historyCard(state)}
        ${tradesCard(state)}
        ${dividendsCard(state)}
      </div>`;
  }

  function updateChart(state) {
    if (!chart) return;
    const summary = portfolioSummary(state.account, state.market.quotes);
    const history = state.account.equityHistory || [];
    const values = history.map((entry) => entry.equity);
    if (!values.length) values.push(state.account.initialCash);
    values.push(summary.total);
    chart.setData({
      values,
      labels: [
        history.length ? formatMarketDate(history[0].day, i18n.locale) : t('portfolio.startLabel'),
        t('common.today'),
      ],
    });
  }

  function patchNumbers(state) {
    const summary = portfolioSummary(state.account, state.market.quotes);
    const setMoney = (id, value) => {
      const node = container.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    setMoney('pf-equity', money(summary.total, i18n.locale));
    setMoney('pf-cash', money(summary.cash, i18n.locale));
    setMoney('pf-holdings', money(summary.holdingsValue, i18n.locale));
    setMoney('pf-unreal', signedMoney(summary.unrealized, i18n.locale));
    setMoney('pf-realized', signedMoney(summary.realized, i18n.locale));
    setMoney('pf-return', pct(summary.returnPct, i18n.locale, 2));
    for (const row of summary.rows) {
      const tr = container.querySelector(`[data-row="${row.ticker}"]`);
      if (!tr) continue;
      const last = tr.querySelector('[data-cell="last"]');
      const value = tr.querySelector('[data-cell="value"]');
      const weight = tr.querySelector('[data-cell="weight"]');
      const pnl = tr.querySelector('[data-cell="pnl"]');
      if (last) last.textContent = money(row.last, i18n.locale);
      if (value) value.textContent = money(row.value, i18n.locale);
      if (weight) weight.textContent = pct(row.weight, i18n.locale, 1, false);
      if (pnl) {
        pnl.innerHTML = `<span class="${row.pnl > 0 ? 'up' : row.pnl < 0 ? 'down' : 'flat'}">${signedMoney(row.pnl, i18n.locale)} · ${pct(row.pnlPct, i18n.locale, 2)}</span>`;
      }
    }
    updateChart(state);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) router.go(go.dataset.go);
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    if (chart) chart.destroy();
    const canvas = container.querySelector('#portfolio-chart');
    if (canvas) {
      chart = new LineChart(canvas, {
        height: 240,
        color: '#5eead4',
        yFormat: (value) => money(value, i18n.locale, 2),
        padding: { top: 16, right: 14, bottom: 22, left: 78 },
      });
      updateChart(state);
    }
  }

  function onTick(state) {
    patchNumbers(state);
  }

  function destroy() {
    if (chart) chart.destroy();
    chart = null;
  }

  return { mount, render, onTick, destroy };
}
