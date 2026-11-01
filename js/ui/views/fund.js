/**
 * Fund management view: create a fund, trade its portfolio, manage clients and
 * staff, and watch fees, redemptions and risk limits.
 */
import { LineChart } from '../chart.js';
import {
  money, moneyCompact, num, pct, signedMoney,
} from '../../core/format.js';
import { pageHead, card, statCard, keyValueList } from '../kit.js';
import { icon } from '../icons.js';
import { esc } from '../dom.js';
import { formatMarketDate } from '../../market/calendar.js';
import { unlockedCompanies } from '../../market/marketAccess.js';
import { positionRows } from '../../trading/account.js';
import {
  FUND_STRATEGIES, FUND_RISK_PROFILES, FUND_ROLES, FUND_RANK_REQUIREMENT,
  FUND_AUM_OPTIONS, FUND_FEE_INTERVAL, FUND_MAX_DRAWDOWN, FUND_MAX_UNPAID_DAYS,
  FUND_MAX_RISK_DAYS, fundMetrics, fundLeaderboard, fundUnlocked,
} from '../../fund/fundEngine.js';

export function createFundView(ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;
  let chart;
  let selectedTicker = '';
  let tradeQty = 10;

  function fmtPercent(value, digits = 2) {
    return `${num(value, i18n.locale, digits)}%`;
  }

  function setupCard(state) {
    const strategies = Object.values(FUND_STRATEGIES);
    const risks = Object.values(FUND_RISK_PROFILES);
    return card({
      className: 'fund-setup',
      title: t('fund.setupTitle'),
      subtitle: t('fund.setupSubtitle'),
      body: `
        <form data-fund-form>
          <div class="fund-form">
            <label class="field">
              <span class="field-label">${t('fund.nameLabel')}</span>
              <input class="input" name="fundName" maxlength="36" value="Atlas Capital" placeholder="${t('fund.namePlaceholder')}" required>
            </label>
            <label class="field">
              <span class="field-label">${t('fund.strategyLabel')}</span>
              <select class="input input--select" name="strategy">
                ${strategies.map((strategy) => `<option value="${strategy.id}">${t(strategy.nameKey)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('fund.riskLabel')}</span>
              <select class="input input--select" name="riskProfile">
                ${risks.map((risk) => `<option value="${risk.id}" ${risk.id === 'balanced' ? 'selected' : ''}>${t(risk.nameKey)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('fund.aumLabel')}</span>
              <select class="input input--select" name="initialAum">
                ${FUND_AUM_OPTIONS.map((value, index) => `<option value="${value}" ${index === 1 ? 'selected' : ''}>${moneyCompact(value, i18n.locale)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('fund.managementFeeLabel')}</span>
              <select class="input input--select" name="managementRate">
                <option value="0.01">${t('fund.managementFeeOption', { value: 1 })}</option>
                <option value="0.02" selected>${t('fund.managementFeeOption', { value: 2 })}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">${t('fund.performanceFeeLabel')}</span>
              <select class="input input--select" name="performanceRate">
                <option value="0.1">${t('fund.performanceFeeOption', { value: 10 })}</option>
                <option value="0.2" selected>${t('fund.performanceFeeOption', { value: 20 })}</option>
              </select>
            </label>
          </div>
          <div class="fund-strategy-list">
            ${strategies.map((strategy) => `
              <div class="fund-strategy">
                <strong>${t(strategy.nameKey)}</strong>
                <p class="muted">${t(strategy.descKey)}</p>
              </div>`).join('')}
          </div>
          <div class="button-row">
            <button class="btn btn--primary" type="submit">${icon('plus', { size: 15 })} ${t('fund.create')}</button>
          </div>
        </form>
        <p class="chart-note muted">${t('fund.setupNote', {
          fee: fmtPercent(2, 0),
          interval: FUND_FEE_INTERVAL,
        })}</p>`,
    });
  }

  function lockedCard(state) {
    const current = state.career?.rank || 1;
    return card({
      className: 'fund-locked',
      title: t('fund.lockedTitle'),
      subtitle: t('fund.lockedText', { rank: FUND_RANK_REQUIREMENT, current }),
      body: `
        <p class="muted">${t('fund.lockedHint')}</p>
        <div class="button-row">
          <a class="btn btn--ghost" href="#/career">${icon('arrowRight', { size: 15 })} ${t('fund.goCareer')}</a>
        </div>`,
    });
  }

  function closureCard(state) {
    const metrics = fundMetrics(state.fund, state);
    if (!metrics) return '';
    return card({
      className: 'fund-closure',
      title: t('fund.close.title'),
      subtitle: t(`fund.closeReason.${state.fund.closeReason}`),
      body: `
        <div class="fund-closure__stats">
          <div><span>${t('fund.close.finalAum')}</span><strong>${money(metrics.nav, i18n.locale)}</strong></div>
          <div><span>${t('fund.close.finalReturn')}</span><strong class="${metrics.totalReturn >= 0 ? 'up' : 'down'}">${pct(metrics.totalReturn, i18n.locale, 2)}</strong></div>
          <div><span>${t('fund.close.finalDrawdown')}</span><strong class="down">${fmtPercent(metrics.drawdown)}</strong></div>
        </div>
        <p class="muted">${t('fund.close.note', { day: formatMarketDate(state.fund.closedDay || 0, i18n.locale) })}</p>`,
    });
  }

  function statGrid(metrics, state) {
    const clients = state.fund.clients.length;
    return `
      <div class="stat-grid">
        ${statCard({
          label: t('fund.stats.aum'),
          value: moneyCompact(metrics.nav, i18n.locale),
          sub: t('fund.stats.aumSub', { count: clients }),
          iconName: 'portfolio',
          id: 'fund-aum',
        })}
        ${statCard({
          label: t('fund.stats.navPerUnit'),
          value: money(metrics.navPerUnit, i18n.locale, 4),
          sub: t('fund.stats.navSub', { units: num(metrics.units, i18n.locale, 0) }),
          iconName: 'market',
          id: 'fund-nav',
        })}
        ${statCard({
          label: t('fund.stats.totalReturn'),
          value: pct(metrics.totalReturn, i18n.locale, 2),
          sub: t('fund.stats.vsBenchmark', { value: pct(metrics.alpha, i18n.locale, 2) }),
          tone: metrics.totalReturn >= 0 ? 'up' : 'down',
          iconName: 'trading',
          id: 'fund-return',
        })}
        ${statCard({
          label: t('fund.stats.drawdown'),
          value: fmtPercent(metrics.drawdown),
          sub: t('fund.stats.drawdownSub', { limit: FUND_MAX_DRAWDOWN }),
          tone: metrics.drawdown > 0 ? 'down' : '',
          iconName: 'warning',
          id: 'fund-drawdown',
        })}
        ${statCard({
          label: t('fund.stats.cashRatio'),
          value: fmtPercent(metrics.cashRatio),
          sub: t('fund.stats.cashSub', { min: fmtPercent(metrics.minCashPct) }),
          iconName: 'portfolio',
          id: 'fund-cash-ratio',
        })}
        ${statCard({
          label: t('fund.stats.companyCash'),
          value: money(state.fund.companyCash, i18n.locale),
          sub: t('fund.stats.companyCashSub', { value: money(state.fund.withdrawnToPersonal || 0, i18n.locale) }),
          iconName: 'sparkle',
          id: 'fund-company-cash',
        })}
        ${statCard({
          label: t('fund.stats.managementFees'),
          value: money(state.fund.managementFees, i18n.locale),
          sub: t('fund.stats.feeSub', { days: Math.max(0, state.fund.lastFeeDay + FUND_FEE_INTERVAL - state.market.day) }),
          iconName: 'sparkle',
          id: 'fund-mgmt-fees',
        })}
        ${statCard({
          label: t('fund.stats.performanceFees'),
          value: money(state.fund.performanceFees, i18n.locale),
          sub: t('fund.stats.hwmSub', { value: money(state.fund.highWaterMark, i18n.locale, 4) }),
          iconName: 'sparkle',
          id: 'fund-perf-fees',
        })}
      </div>`;
  }

  function chartCard() {
    return card({
      className: 'fund-chart',
      title: t('fund.chart.title'),
      subtitle: t('fund.chart.subtitle'),
      body: `<div class="chart-wrap"><canvas id="fund-nav-chart" style="height:220px"></canvas></div>
        <p class="chart-note muted">${t('fund.chart.note')}</p>`,
    });
  }

  function riskCard(metrics, state) {
    const row = (label, value, limit, breached) => `
      <div class="fund-risk-row">
        <span>${label}</span>
        <strong>${value}</strong>
        <span class="muted">${limit}</span>
        <span class="pill ${breached ? 'pill--warn' : 'pill--ok'}">${t(breached ? 'fund.risk.breach' : 'fund.risk.ok')}</span>
      </div>`;
    return card({
      className: 'fund-risk',
      title: t('fund.risk.title'),
      subtitle: t('fund.risk.subtitle'),
      body: `
        ${row(
          t('fund.risk.cash'),
          `<span id="fund-risk-cash">${fmtPercent(metrics.cashRatio)}</span>`,
          t('fund.risk.minCash', { value: fmtPercent(metrics.minCashPct) }),
          metrics.cashBreach,
        )}
        ${row(
          t('fund.risk.topPosition'),
          `<span id="fund-risk-top">${metrics.topTicker ? `${metrics.topTicker} · ${fmtPercent(metrics.topWeight)}` : t('fund.risk.noPosition')}</span>`,
          t('fund.risk.maxPosition', { value: fmtPercent(metrics.maxPositionPct) }),
          metrics.positionBreach,
        )}
        ${row(
          t('fund.risk.drawdown'),
          `<span id="fund-risk-drawdown">${fmtPercent(metrics.drawdown)}</span>`,
          t('fund.risk.maxDrawdown', { value: `${FUND_MAX_DRAWDOWN}%` }),
          metrics.drawdown >= FUND_MAX_DRAWDOWN,
        )}
        <div class="fund-risk-row">
          <span>${t('fund.risk.benchmark')}</span>
          <strong>${pct(metrics.benchmark, i18n.locale, 2)}</strong>
          <span class="muted">${t('fund.risk.alpha')}</span>
          <span class="${metrics.alpha >= 0 ? 'up' : 'down'}">${pct(metrics.alpha, i18n.locale, 2)}</span>
        </div>
        ${metrics.cashBreach || metrics.positionBreach || metrics.drawdown >= FUND_MAX_DRAWDOWN
          ? `<p class="fund-warning">${icon('warning', { size: 14 })} ${t('fund.risk.warning')}</p>`
          : `<p class="muted fund-hint">${t('fund.risk.healthy')}</p>`}
        <p class="chart-note muted">${t('fund.risk.days', { days: metrics.riskDays, max: FUND_MAX_RISK_DAYS })}</p>`,
    });
  }

  function tradingCard(metrics, state) {
    const companies = unlockedCompanies(state);
    if (!selectedTicker || !companies.some((company) => company.ticker === selectedTicker)) {
      selectedTicker = companies[0]?.ticker || '';
    }
    const quote = state.market.quotes[selectedTicker];
    const rows = positionRows(state.fund.account, state.market.quotes)
      .map((row) => {
        const weight = metrics.nav > 0 ? (row.value / metrics.nav) * 100 : 0;
        return `<tr data-fund-row="${row.ticker}">
          <td><strong>${row.ticker}</strong></td>
          <td class="num">${num(row.qty, i18n.locale, 0)}</td>
          <td class="num">${money(row.avgCost, i18n.locale)}</td>
          <td class="num" data-cell="value">${money(row.value, i18n.locale)}</td>
          <td class="num ${row.pnl >= 0 ? 'up' : 'down'}" data-cell="pnl">${signedMoney(row.pnl, i18n.locale)}</td>
          <td class="num" data-cell="weight">${fmtPercent(weight, 1)}</td>
        </tr>`;
      });
    return card({
      className: 'fund-trading',
      title: t('fund.trade.title'),
      subtitle: t('fund.trade.subtitle'),
      actions: `<span class="pill">${t('fund.trade.cash', { value: money(state.fund.account.cash, i18n.locale) })}</span>`,
      body: `
        <div class="fund-trade">
          <select class="input input--select" data-fund-ticker aria-label="${t('fund.trade.ticker')}">
            ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === selectedTicker ? 'selected' : ''}>${company.ticker} · ${company.name}</option>`).join('')}
          </select>
          <input class="input" type="number" min="1" step="1" value="${tradeQty}" data-fund-qty aria-label="${t('fund.trade.qty')}">
          <button class="btn btn--primary" type="button" data-fund-buy>${t('fund.trade.buy')}</button>
          <button class="btn btn--ghost" type="button" data-fund-sell>${t('fund.trade.sell')}</button>
        </div>
        <div class="fund-trade-meta">
          <span id="fund-quote">${quote ? t('fund.trade.quote', {
            bid: money(quote.bid, i18n.locale),
            ask: money(quote.ask, i18n.locale),
          }) : ''}</span>
          <span id="fund-max-buy" class="muted">${t('fund.trade.maxBuy', {
            qty: num(maxBuy(state, metrics), i18n.locale, 0),
          })}</span>
        </div>
        ${rows.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr>
                <th>${t('fund.trade.ticker')}</th>
                <th class="num">${t('fund.trade.qty')}</th>
                <th class="num">${t('fund.trade.avgCost')}</th>
                <th class="num">${t('fund.trade.value')}</th>
                <th class="num">${t('fund.trade.pnl')}</th>
                <th class="num">${t('fund.trade.weight')}</th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table></div>`
          : `<p class="muted">${t('fund.trade.noPositions')}</p>`}
        <p class="chart-note muted">${t('fund.trade.note', {
          cap: fmtPercent(metrics.maxPositionPct),
          cash: fmtPercent(metrics.minCashPct),
          fee: money(state.fund.employees.some((employee) => employee.id === 'trader') ? 0.5 : 1, i18n.locale),
        })}</p>`,
    });
  }

  function maxBuy(state, metrics) {
    const quote = state.market.quotes[selectedTicker];
    if (!quote || quote.ask <= 0) return 0;
    const pos = state.fund.account.positions[selectedTicker];
    const existing = pos && pos.qty > 0 ? pos.qty : 0;
    const capCash = Math.max(0, metrics.nav * (state.fund.maxPosition || 0) - existing * quote.ask);
    const floorCash = Math.max(0, state.fund.account.cash - metrics.nav * (state.fund.minCash || 0));
    return Math.max(0, Math.floor(Math.min(capCash, floorCash) / quote.ask));
  }

  function clientsCard(metrics, state) {
    const clients = state.fund.clients || [];
    const rows = clients.map((client) => {
      const value = client.units * metrics.navPerUnit;
      const request = client.request;
      const dueIn = request ? Math.max(0, request.dueDay - state.market.day) : null;
      const amount = request ? request.units * metrics.navPerUnit : 0;
      const canPay = request && state.fund.account.cash >= amount;
      return `<tr>
        <td><strong>${client.name}</strong><span class="fund-sub">${t(client.typeKey)}</span></td>
        <td class="num">${money(value, i18n.locale)}</td>
        <td class="num">${t(`fund.clientRisk.${client.risk}`)}</td>
        <td class="num">${num(client.trust, i18n.locale, 0)}</td>
        <td>${request
          ? `<span class="pill pill--warn">${t('fund.clients.requestPending', { days: dueIn })}</span>`
          : `<span class="pill pill--ok">${t('fund.clients.active')}</span>`}</td>
        <td class="num">${request
          ? `<button class="btn btn--sm ${canPay ? 'btn--danger' : 'btn--ghost'}" type="button" data-fund-settle="${client.id}" ${canPay ? '' : 'disabled'}>${t('fund.clients.settle')}</button>`
          : '—'}</td>
      </tr>`;
    });
    const candidates = state.fund.candidates || [];
    return card({
      className: 'fund-clients',
      title: t('fund.clients.title', { count: clients.length }),
      subtitle: t('fund.clients.subtitle'),
      actions: `<span class="pill">${t('fund.clients.cash', { value: money(state.fund.account.cash, i18n.locale) })}</span>`,
      body: `
        ${rows.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr>
                <th>${t('fund.clients.name')}</th>
                <th class="num">${t('fund.clients.value')}</th>
                <th class="num">${t('fund.clients.risk')}</th>
                <th class="num">${t('fund.clients.trust')}</th>
                <th>${t('fund.clients.status')}</th>
                <th class="num">${t('fund.clients.action')}</th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table></div>`
          : `<p class="muted">${t('fund.clients.none')}</p>`}
        <div class="fund-candidates">
          <h3 class="fund-subtitle">${t('fund.clients.candidates')}</h3>
          ${candidates.length
            ? candidates.map((candidate) => `
              <div class="fund-candidate">
                <div>
                  <strong>${candidate.name}</strong>
                  <span class="fund-sub">${t(candidate.typeKey)} · ${t(`fund.clientRisk.${candidate.risk}`)}</span>
                </div>
                <span class="muted">${t('fund.clients.principal', { value: money(candidate.principal, i18n.locale) })}</span>
                <button class="btn btn--ghost btn--sm" type="button" data-fund-accept="${candidate.id}">${t('fund.clients.accept')}</button>
              </div>`).join('')
            : `<p class="muted">${t('fund.clients.noCandidates')}</p>`}
        </div>
        <p class="chart-note muted">${t('fund.clients.note', { grace: 3 })}</p>`,
    });
  }

  function teamCard(state) {
    const employees = state.fund.employees || [];
    const cards = FUND_ROLES.map((role) => {
      const hired = employees.find((employee) => employee.id === role.id);
      const canHire = state.fund.companyCash >= role.salary + (state.fund.payrollDue || 0);
      return `
        <article class="fund-team-member ${hired ? 'is-hired' : ''}">
          <header>
            <div>
              <strong>${t(role.nameKey)}</strong>
              <p class="muted">${t(role.descKey)}</p>
            </div>
            <span class="pill ${hired ? 'pill--ok' : ''}">${t(hired ? 'fund.team.hired' : 'fund.team.open')}</span>
          </header>
          <div class="fund-team-meta">
            <span>${t('fund.team.salary', { value: money(role.salary, i18n.locale) })}</span>
            <span>${t('fund.team.skill', { value: role.skill })}</span>
            <span class="muted">${hired ? hired.name : '—'}</span>
          </div>
          ${hired
            ? `<button class="btn btn--ghost btn--sm" type="button" data-fund-fire="${role.id}">${t('fund.team.fire')}</button>`
            : `<button class="btn btn--primary btn--sm" type="button" data-fund-hire="${role.id}" ${canHire ? '' : 'disabled'}>${t('fund.team.hire')}</button>`}
        </article>`;
    });
    return card({
      className: 'fund-team',
      title: t('fund.team.title'),
      subtitle: t('fund.team.subtitle'),
      actions: `<span class="pill ${state.fund.payrollDue > 0 ? 'pill--warn' : ''}">${t('fund.team.payroll', {
        value: money(state.fund.payrollDue || 0, i18n.locale),
        days: state.fund.unpaidSalaryDays || 0,
      })}</span>`,
      body: `
        <div class="fund-team-grid">${cards.join('')}</div>
        <p class="chart-note muted">${t('fund.team.note', { max: FUND_MAX_UNPAID_DAYS })}</p>`,
    });
  }

  function operationsCard(state) {
    const fund = state.fund;
    const nextFee = Math.max(0, fund.lastFeeDay + FUND_FEE_INTERVAL - state.market.day);
    return card({
      className: 'fund-operations',
      title: t('fund.ops.title'),
      subtitle: t('fund.ops.subtitle'),
      body: `
        ${keyValueList([
          [t('fund.ops.managementRate'), `${fmtPercent((fund.managementRate || 0) * 100, 1)} ${t('fund.ops.perYear')}`],
          [t('fund.ops.performanceRate'), fmtPercent((fund.performanceRate || 0) * 100, 1)],
          [t('fund.ops.hwm'), money(fund.highWaterMark, i18n.locale, 4)],
          [t('fund.ops.nextFee'), t('fund.ops.inDays', { days: nextFee })],
          [t('fund.ops.payrollDue'), money(fund.payrollDue || 0, i18n.locale)],
          [t('fund.ops.feePayable'), money(fund.feePayable || 0, i18n.locale)],
          [t('fund.ops.companyCash'), money(fund.companyCash, i18n.locale)],
          [t('fund.ops.withdrawn'), money(fund.withdrawnToPersonal || 0, i18n.locale)],
        ])}
        <div class="button-row">
          <button class="btn btn--ghost" type="button" data-fund-withdraw ${fund.companyCash > 0 ? '' : 'disabled'}>
            ${icon('download', { size: 15 })} ${t('fund.ops.withdraw')}
          </button>
        </div>
        <p class="chart-note muted">${t('fund.ops.note')}</p>`,
    });
  }

  function leaderboardCard(metrics, state) {
    const peers = fundLeaderboard(state.fund, state.market.day);
    const player = {
      id: 'player',
      name: state.fund.name,
      totalReturn: metrics.totalReturn,
      aum: metrics.nav,
      player: true,
    };
    const rows = [...peers, player].sort((a, b) => b.totalReturn - a.totalReturn);
    return card({
      className: 'fund-leaderboard',
      title: t('fund.leaderboard.title'),
      subtitle: t('fund.leaderboard.subtitle'),
      body: `
        <div class="table-wrap"><table class="table table--compact">
          <thead><tr>
            <th>#</th>
            <th>${t('fund.leaderboard.fund')}</th>
            <th class="num">${t('fund.leaderboard.return')}</th>
            <th class="num">${t('fund.leaderboard.aum')}</th>
          </tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr class="${row.player ? 'is-player' : ''}">
                <td class="num">${index + 1}</td>
                <td>${row.player ? esc(row.name) : t(row.nameKey)} ${row.player ? `<span class="pill">${t('fund.leaderboard.you')}</span>` : ''}</td>
                <td class="num ${row.totalReturn >= 0 ? 'up' : 'down'}">${pct(row.totalReturn, i18n.locale, 2)}</td>
                <td class="num">${moneyCompact(row.aum, i18n.locale)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
        <p class="chart-note muted">${t('fund.leaderboard.note')}</p>`,
    });
  }

  function insightsCard(state) {
    const insights = [...(state.fund.insights || [])].sort((a, b) => b.day - a.day).slice(0, 6);
    return card({
      className: 'fund-insights',
      title: t('fund.insights.title'),
      subtitle: t('fund.insights.subtitle'),
      body: insights.length
        ? `<div class="fund-insight-list">
            ${insights.map((insight) => `
              <article class="fund-insight">
                <header>
                  <span class="pill">${t(`fund.role.${insight.role}.name`)}</span>
                  <span class="muted">${formatMarketDate(insight.day, i18n.locale)}</span>
                </header>
                <p>${insightText(insight)}</p>
              </article>`).join('')}
          </div>`
        : `<p class="muted">${t('fund.insights.empty')}</p>`,
    });
  }

  function insightText(insight) {
    if (insight.kind === 'research') {
      return t('fund.insight.research', {
        ticker: insight.ticker,
        rating: t(`fund.rating.${insight.rating}`),
        momentum: pct(insight.momentum, i18n.locale, 2),
      });
    }
    if (insight.kind === 'quant') {
      return t('fund.insight.quant', {
        ticker: insight.ticker,
        momentum: pct(insight.momentum, i18n.locale, 2),
      });
    }
    if (insight.kind === 'macro') {
      const snapshot = insight.snapshot;
      return t('fund.insight.macro', {
        rate: fmtPercent(snapshot.policyRate, 1),
        inflation: fmtPercent(snapshot.inflation, 1),
        growth: fmtPercent(snapshot.growth, 1),
        regime: t(`macro.regime.${snapshot.regime}`),
      });
    }
    if (insight.kind === 'risk') {
      return t('fund.insight.risk', {
        cash: fmtPercent(insight.cashRatio, 2),
        top: fmtPercent(insight.topWeight, 2),
        drawdown: fmtPercent(insight.drawdown, 2),
      });
    }
    return '';
  }

  function eventsCard(state) {
    const events = (state.fund.events || []).slice(0, 8);
    return card({
      className: 'fund-events',
      title: t('fund.events.title'),
      subtitle: t('fund.events.subtitle'),
      body: events.length
        ? `<ul class="fund-event-list">
            ${events.map((event) => `
              <li>
                <span class="muted">${formatMarketDate(event.day ?? state.market.day, i18n.locale)}</span>
                <span>${eventText(event)}</span>
              </li>`).join('')}
          </ul>`
        : `<p class="muted">${t('fund.events.empty')}</p>`,
    });
  }

  function eventText(event) {
    switch (event.type) {
      case 'created':
        return t('fund.event.created', { amount: money(event.amount, i18n.locale) });
      case 'subscription':
        return t('fund.event.subscription', { name: event.name, amount: money(event.amount, i18n.locale) });
      case 'redemption':
      case 'redemptionPaid':
        return t('fund.event.redemption', { name: event.name, amount: money(event.amount, i18n.locale) });
      case 'redemptionRequest':
        return t('fund.event.redemptionRequest', { name: event.name });
      case 'dividend':
        return t('fund.event.dividend', { amount: money(event.amount, i18n.locale) });
      case 'managementFee':
        return t('fund.event.managementFee', { amount: money(event.amount, i18n.locale) });
      case 'performanceFee':
        return t('fund.event.performanceFee', { amount: money(event.amount, i18n.locale) });
      case 'payroll':
        return t('fund.event.payroll', { amount: money(event.amount, i18n.locale) });
      case 'payrollShort':
        return t('fund.event.payrollShort', { amount: money(event.amount, i18n.locale) });
      case 'candidate':
        return t('fund.event.candidate', { name: event.name, amount: money(event.amount, i18n.locale) });
      case 'closed':
        return t('fund.event.closed', { reason: t(`fund.closeReason.${event.reason}`) });
      default:
        return t('fund.event.other');
    }
  }

  function activeBody(state) {
    const metrics = fundMetrics(state.fund, state);
    if (!metrics) return '<p class="muted">—</p>';
    return `
      <div id="fund-live">
        ${statGrid(metrics, state)}
        <div class="fund-split">
          ${chartCard()}
          ${riskCard(metrics, state)}
        </div>
      </div>
      ${tradingCard(metrics, state)}
      <div class="fund-split">
        ${clientsCard(metrics, state)}
        ${teamCard(state)}
      </div>
      <div class="fund-split">
        ${operationsCard(state)}
        ${leaderboardCard(metrics, state)}
      </div>
      ${insightsCard(state)}
      ${eventsCard(state)}
      <p class="chart-note muted">${t('fund.note')}</p>`;
  }

  function template(state) {
    const fund = state.fund || { status: 'none' };
    const sandbox = ctx.appMode === 'sandbox';
    const unlocked = fundUnlocked(state);
    const active = fund.status === 'active';
    const closed = fund.status === 'closed';
    return `
      <div class="fund-page">
        ${pageHead({
          eyebrow: t('fund.eyebrow'),
          title: t('fund.title'),
          subtitle: t('fund.subtitle'),
          actions: `${active ? `<span class="pill pill--ok">${t('fund.status.active')}</span>` : ''}${closed ? `<span class="pill pill--warn">${t('fund.status.closed')}</span>` : ''}`,
        })}
        ${sandbox
          ? card({
            className: 'fund-locked',
            title: t('fund.careerOnly'),
            body: `<p class="muted">${t('fund.careerOnlyNote')}</p>`,
          })
          : ''}
        ${!sandbox && !unlocked ? lockedCard(state) : ''}
        ${!sandbox && unlocked && closed ? closureCard(state) : ''}
        ${!sandbox && unlocked && !active ? setupCard(state) : ''}
        ${!sandbox && unlocked && active ? activeBody(state) : ''}
      </div>`;
  }

  function updateChart(state) {
    if (!chart) return;
    const metrics = fundMetrics(state.fund, state);
    if (!metrics) return;
    const values = (state.fund.history || []).map((entry) => entry.navPerUnit);
    values.push(metrics.navPerUnit);
    chart.setData({ values });
  }

  function patchNumbers(state) {
    if (!container || !state.fund || state.fund.status !== 'active') return;
    const metrics = fundMetrics(state.fund, state);
    if (!metrics) return;
    const setText = (id, value) => {
      const node = container.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    setText('fund-aum', moneyCompact(metrics.nav, i18n.locale));
    setText('fund-aum-sub', t('fund.stats.aumSub', { count: state.fund.clients.length }));
    setText('fund-nav', money(metrics.navPerUnit, i18n.locale, 4));
    setText('fund-return', pct(metrics.totalReturn, i18n.locale, 2));
    setText('fund-return-sub', t('fund.stats.vsBenchmark', { value: pct(metrics.alpha, i18n.locale, 2) }));
    setText('fund-drawdown', fmtPercent(metrics.drawdown));
    setText('fund-cash-ratio', fmtPercent(metrics.cashRatio));
    setText('fund-company-cash', money(state.fund.companyCash, i18n.locale));
    setText('fund-mgmt-fees', money(state.fund.managementFees, i18n.locale));
    setText('fund-perf-fees', money(state.fund.performanceFees, i18n.locale));
    setText('fund-risk-cash', fmtPercent(metrics.cashRatio));
    setText('fund-risk-top', metrics.topTicker ? `${metrics.topTicker} · ${fmtPercent(metrics.topWeight)}` : t('fund.risk.noPosition'));
    setText('fund-risk-drawdown', fmtPercent(metrics.drawdown));
    const quote = state.market.quotes[selectedTicker];
    const quoteNode = container.querySelector('#fund-quote');
    if (quoteNode && quote) {
      quoteNode.textContent = t('fund.trade.quote', {
        bid: money(quote.bid, i18n.locale),
        ask: money(quote.ask, i18n.locale),
      });
    }
    const maxNode = container.querySelector('#fund-max-buy');
    if (maxNode) maxNode.textContent = t('fund.trade.maxBuy', { qty: num(maxBuy(state, metrics), i18n.locale, 0) });
    for (const row of positionRows(state.fund.account, state.market.quotes)) {
      const tr = container.querySelector(`[data-fund-row="${row.ticker}"]`);
      if (!tr) continue;
      const weight = metrics.nav > 0 ? (row.value / metrics.nav) * 100 : 0;
      const value = tr.querySelector('[data-cell="value"]');
      const pnl = tr.querySelector('[data-cell="pnl"]');
      const weightCell = tr.querySelector('[data-cell="weight"]');
      if (value) value.textContent = money(row.value, i18n.locale);
      if (pnl) {
        pnl.textContent = signedMoney(row.pnl, i18n.locale);
        pnl.classList.toggle('up', row.pnl >= 0);
        pnl.classList.toggle('down', row.pnl < 0);
      }
      if (weightCell) weightCell.textContent = fmtPercent(weight, 1);
    }
    updateChart(state);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const buy = event.target.closest('[data-fund-buy]');
      if (buy) {
        actions.fundBuy({ ticker: selectedTicker, qty: Number(tradeQty) });
        return;
      }
      const sell = event.target.closest('[data-fund-sell]');
      if (sell) {
        actions.fundSell({ ticker: selectedTicker, qty: Number(tradeQty) });
        return;
      }
      const hire = event.target.closest('[data-fund-hire]');
      if (hire) {
        actions.fundHire(hire.dataset.fundHire);
        return;
      }
      const fire = event.target.closest('[data-fund-fire]');
      if (fire) {
        actions.fundFire(fire.dataset.fundFire);
        return;
      }
      const accept = event.target.closest('[data-fund-accept]');
      if (accept) {
        actions.fundAcceptClient(accept.dataset.fundAccept);
        return;
      }
      const settle = event.target.closest('[data-fund-settle]');
      if (settle) {
        actions.fundSettleRedemption(settle.dataset.fundSettle);
        return;
      }
      if (event.target.closest('[data-fund-withdraw]')) {
        actions.fundWithdrawCompanyCash();
      }
    });
    root.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-fund-form]')) return;
      event.preventDefault();
      const data = new FormData(event.target);
      actions.createFund({
        name: data.get('fundName'),
        strategy: data.get('strategy'),
        riskProfile: data.get('riskProfile'),
        initialAum: Number(data.get('initialAum')),
        managementRate: Number(data.get('managementRate')),
        performanceRate: Number(data.get('performanceRate')),
      });
    });
    root.addEventListener('change', (event) => {
      if (event.target.matches('[data-fund-ticker]')) {
        selectedTicker = event.target.value;
        patchNumbers(store.get());
      }
    });
    root.addEventListener('input', (event) => {
      if (event.target.matches('[data-fund-qty]')) {
        tradeQty = Math.max(1, Math.floor(Number(event.target.value) || 1));
      }
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    if (chart) {
      chart.destroy();
      chart = null;
    }
    const canvas = container.querySelector('#fund-nav-chart');
    if (canvas) {
      chart = new LineChart(canvas, {
        height: 220,
        showYAxis: true,
        yFormat: (value) => money(value, i18n.locale, 2),
        color: '#5eead4',
      });
      updateChart(state);
    }
  }

  function onTick(state) {
    patchNumbers(state);
  }

  function destroy() {
    if (chart) chart.destroy();
  }

  return { mount, render, onTick, destroy };
}
