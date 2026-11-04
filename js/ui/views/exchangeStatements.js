/**
 * Full quarterly statement detail page for one simulated-exchange company.
 * It reads the last saved exchange snapshot so it can be opened without
 * coupling to the live tick loop.
 */
import { pageHead, card, table } from '../kit.js';
import { money, num, pct } from '../../core/format.js';
import { sectorLabel } from '../labels.js';
import {
  deserializeExchange, reportHistory, SIM_EXCHANGE_SAVE_KEY,
} from '../../sim/exchangeEngine.js';

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SIM_EXCHANGE_SAVE_KEY);
    return raw ? deserializeExchange(raw) : null;
  } catch (error) {
    console.warn('[exchange-statements] restore failed', error);
    return null;
  }
}

export function createExchangeStatementsView(ctx, ticker) {
  const { i18n, router } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const moneyFmt = (value) => money(value, i18n.locale);
  const numFmt = (value, digits = 0) => num(value, i18n.locale, digits);
  const pctFmt = (value, digits = 1) => pct(value, i18n.locale, digits, false);
  let container = null;
  let state = loadSnapshot();
  let selected = ticker && state?.companies[ticker] ? ticker : null;
  let selectedQuarter = null;

  if (state && !selected) {
    selected = Object.keys(state.companies)[0] || null;
  }

  function reports() {
    return selected ? reportHistory(state, selected, 12) : [];
  }

  function currentReport() {
    const list = reports();
    if (!list.length) return null;
    if (selectedQuarter === null) return list[0];
    return list.find((report) => report.quarter === selectedQuarter) || list[0];
  }

  function rowsFor(rows) {
    return table({
      head: [t('exchange.statementLine'), t('exchange.statementValue')],
      rows: rows.map(([label, value]) => [label, value]),
      empty: t('exchange.noReport'),
    });
  }

  function reportHeader(report) {
    return `<div class="exchange-statement-summary">
      <div><span>${t('exchange.reportPeriod')}</span><strong>${report.periodLabel}</strong></div>
      <div><span>${t('exchange.reportedOnLabel')}</span><strong>${report.reportDate}</strong></div>
      <div><span>${t('exchange.reportEps')}</span><strong>${moneyFmt(report.income.eps)}</strong></div>
      <div><span>${t('exchange.reportNetMargin')}</span><strong>${pctFmt(report.ratios.netMargin * 100)}</strong></div>
      ${report.splitFactor > 1 ? `<div><span>${t('exchange.statementSplitFactor')}</span><strong>×${numFmt(report.splitFactor)}</strong></div>` : ''}
    </div>`;
  }

  function template() {
    if (!state || !selected) {
      return `<div class="exchange-page">${pageHead({
        eyebrow: t('exchange.statementsEyebrow'),
        title: t('exchange.statementsTitle'),
        subtitle: t('exchange.statementsSubtitle'),
        actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/exchange">${t('exchange.backToExchange')}</button>`,
      })}
      <div class="card history-loading"><span>${t('exchange.statementsNoState')}</span>
        <button class="btn btn--ghost btn--sm" type="button" data-go="/exchange">${t('exchange.backToExchange')}</button></div></div>`;
    }
    const company = state.companies[selected].company;
    const list = reports();
    const report = currentReport();
    const quarterOptions = list.map((item) => `<option value="${item.quarter}" ${report && item.quarter === report.quarter ? 'selected' : ''}>${item.periodLabel}</option>`).join('');
    const tickerOptions = Object.keys(state.companies).sort().map((symbol) => `<option value="${symbol}" ${symbol === selected ? 'selected' : ''}>${symbol} · ${state.companies[symbol].company.name}</option>`).join('');
    const incomeRows = report ? [
      [t('exchange.statement.revenue'), moneyFmt(report.income.revenue)],
      [t('exchange.statement.cogs'), moneyFmt(report.income.cogs)],
      [t('exchange.statement.grossProfit'), moneyFmt(report.income.grossProfit)],
      [t('exchange.statement.operatingExpenses'), moneyFmt(report.income.operatingExpenses)],
      [t('exchange.statement.operatingIncome'), moneyFmt(report.income.operatingIncome)],
      [t('exchange.statement.interestExpense'), moneyFmt(report.income.interestExpense)],
      [t('exchange.statement.pretaxIncome'), moneyFmt(report.income.pretaxIncome)],
      [t('exchange.statement.taxExpense'), moneyFmt(report.income.taxExpense)],
      [t('exchange.statement.netIncome'), moneyFmt(report.income.netIncome)],
      [t('exchange.statement.eps'), moneyFmt(report.income.eps)],
      [t('exchange.statement.sharesOutstanding'), numFmt(report.income.sharesOutstanding)],
      [t('exchange.statement.dividendsPaid'), moneyFmt(report.income.dividendsPaid)],
    ] : [];
    const balanceRows = report ? [
      [t('exchange.statement.cash'), moneyFmt(report.balance.cash)],
      [t('exchange.statement.receivables'), moneyFmt(report.balance.receivables)],
      [t('exchange.statement.inventory'), moneyFmt(report.balance.inventory)],
      [t('exchange.statement.ppe'), moneyFmt(report.balance.ppe)],
      [t('exchange.statement.totalAssets'), moneyFmt(report.balance.totalAssets)],
      [t('exchange.statement.debt'), moneyFmt(report.balance.debt)],
      [t('exchange.statement.otherLiabilities'), moneyFmt(report.balance.otherLiabilities)],
      [t('exchange.statement.totalLiabilities'), moneyFmt(report.balance.totalLiabilities)],
      [t('exchange.statement.equity'), moneyFmt(report.balance.equity)],
    ] : [];
    const cashRows = report ? [
      [t('exchange.statement.operatingCashFlow'), moneyFmt(report.cashFlow.operatingCashFlow)],
      [t('exchange.statement.capex'), moneyFmt(report.cashFlow.capex)],
      [t('exchange.statement.investingCashFlow'), moneyFmt(report.cashFlow.investingCashFlow)],
      [t('exchange.statement.financingCashFlow'), moneyFmt(report.cashFlow.financingCashFlow)],
      [t('exchange.statement.debtIssuance'), moneyFmt(report.cashFlow.debtIssuance)],
      [t('exchange.statement.dividendsPaid'), moneyFmt(report.cashFlow.dividendsPaid)],
      [t('exchange.statement.netChange'), moneyFmt(report.cashFlow.netChange)],
      [t('exchange.statement.freeCashFlow'), moneyFmt(report.cashFlow.freeCashFlow)],
    ] : [];
    const ratioRows = report ? [
      [t('exchange.statement.grossMargin'), pctFmt(report.ratios.grossMargin * 100)],
      [t('exchange.statement.operatingMargin'), pctFmt(report.ratios.operatingMargin * 100)],
      [t('exchange.statement.netMargin'), pctFmt(report.ratios.netMargin * 100)],
      [t('exchange.statement.roe'), pctFmt(report.ratios.roe * 100)],
      [t('exchange.statement.debtToEquity'), numFmt(report.ratios.debtToEquity, 2)],
      [t('exchange.statement.bookValuePerShare'), moneyFmt(report.ratios.bookValuePerShare)],
      [t('exchange.statement.annualDividendPerShare'), moneyFmt(report.ratios.annualDividendPerShare)],
      [t('exchange.statement.quarterlyDividendPerShare'), moneyFmt(report.ratios.quarterlyDividendPerShare)],
      [t('exchange.statementSplitFactor'), `×${numFmt(report.splitFactor)}`],
    ] : [];
    return `<div class="exchange-page exchange-statements-page">
      ${pageHead({
        eyebrow: t('exchange.statementsEyebrow'),
        title: `${company.name} · ${t('exchange.statementsTitle')}`,
        subtitle: `${selected} · ${sectorLabel(ctx, company.sector)} · ${t('exchange.statementsSubtitle')}`,
        actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/exchange">${t('exchange.backToExchange')}</button>`,
      })}
      ${card({
        title: t('exchange.statementControls'),
        body: `<div class="exchange-statement-controls">
          <label>${t('exchange.ticker')}<select class="input input--select" data-statement-ticker>${tickerOptions}</select></label>
          <label>${t('exchange.reportPeriod')}<select class="input input--select" data-statement-quarter>${quarterOptions}</select></label>
        </div>
        ${report ? reportHeader(report) : `<p class="muted">${t('exchange.noReport')}</p>`}`,
      })}
      <div class="exchange-statement-grid">
        ${card({ title: t('exchange.incomeStatement'), body: rowsFor(incomeRows) })}
        ${card({ title: t('exchange.balanceSheet'), body: rowsFor(balanceRows) })}
        ${card({ title: t('exchange.cashFlowStatement'), body: rowsFor(cashRows) })}
        ${card({ title: t('exchange.statementRatios'), body: rowsFor(ratioRows) })}
      </div>
      <div class="callout callout--tip">
        <span class="callout__label">${t('exchange.statementsSourceLabel')}</span>
        <p>${t('exchange.statementsNote')}</p>
      </div>
    </div>`;
  }

  function render() {
    if (!container) return;
    container.innerHTML = template();
    container.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => router.go(button.dataset.go));
    });
    container.querySelector('[data-statement-ticker]')?.addEventListener('change', (event) => {
      router.go(`/exchange/statements/${event.target.value}`);
    });
    container.querySelector('[data-statement-quarter]')?.addEventListener('change', (event) => {
      selectedQuarter = Number(event.target.value);
      render();
    });
  }

  function mount(node) {
    container = node;
    selectedQuarter = currentReport()?.quarter ?? null;
    render();
  }

  function destroy() {}

  return { mount, render, destroy };
}
