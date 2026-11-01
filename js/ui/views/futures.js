/**
 * Futures desk: single-stock futures with margin, daily variation and cash
 * settlement at expiry.
 */
import { money, num, pct, signedMoney } from '../../core/format.js';
import { pageHead, card, segmented } from '../kit.js';
import { icon } from '../icons.js';
import { getCompany } from '../../data/companies.js';
import { unlockedCompanies, isCompanyUnlocked } from '../../market/marketAccess.js';
import {
  buildFuturesChain, availableFuturesCash, futuresPositionRows, futuresMargin,
  FUTURES_MULTIPLIER,
} from '../../futures/futuresEngine.js';
import { isToolUnlocked } from '../../education/unlockManager.js';
import { companyName } from '../labels.js';

const EXPIRIES = [30, 60, 90];

export function createFuturesView(ctx) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;
  let ticker = null;
  let expiryDays = 30;
  let side = 'long';
  let qty = '1';

  function currentTicker(state) {
    if (ticker && isCompanyUnlocked(state, ticker)) return ticker;
    const companies = unlockedCompanies(state);
    ticker = companies[0] ? companies[0].ticker : 'AURA';
    return ticker;
  }

  function chainFor(state) {
    const quote = state.market.quotes[currentTicker(state)];
    return quote ? buildFuturesChain(quote, state.market.day) : null;
  }

  function ticketData(state) {
    const chain = chainFor(state);
    const contract = chain ? chain.expiries.find((entry) => entry.days === expiryDays) : null;
    const quantity = Math.max(0, Math.floor(Number(qty) || 0));
    const fee = state.settings.commission;
    const margin = contract ? contract.margin * quantity : 0;
    const room = availableFuturesCash(state.account, { fee, orders: state.orders });
    let error = '';
    if (!contract) error = t('futures.noContract');
    else if (quantity <= 0) error = t('trade.validation.qty');
    else if (margin > room + 1e-9) error = t('error.insufficientFuturesMargin');
    return { chain, contract, quantity, fee, margin, room, error };
  }

  function lockedTemplate(state) {
    return `
      <div class="futures-page">
        ${pageHead({
          eyebrow: t('futures.eyebrow'),
          title: t('futures.title'),
          subtitle: t('futures.subtitle'),
        })}
        ${card({
          className: 'locked-card',
          body: `
            <div class="locked-card__icon">${icon('lock', { size: 26 })}</div>
            <h2>${t('futures.lockedTitle')}</h2>
            <p>${t('futures.lockedText')}</p>
            <button class="btn btn--primary" type="button" data-go="/academy/u29/s1">${t('futures.lockedAction')}</button>`,
        })}
      </div>`;
  }

  function chainCard(state) {
    const chain = chainFor(state);
    if (!chain) return '';
    return card({
      title: t('futures.chainTitle'),
      subtitle: t('futures.chainSubtitle', { ticker }),
      actions: `<span class="pill" id="fut-spot">${t('futures.spotLabel', { value: money(chain.spot, i18n.locale) })}</span>`,
      body: `
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>${t('futures.expiry')}</th><th class="num">${t('futures.price')}</th>
            <th class="num">${t('futures.basis')}</th><th class="num">${t('futures.marginPer')}</th>
          </tr></thead>
          <tbody>${chain.expiries.map((entry) => `
            <tr class="${entry.days === expiryDays ? 'is-selected' : ''}">
              <td>${t('options.expiryOption', { days: entry.days })}</td>
              <td class="num">${money(entry.price, i18n.locale)}</td>
              <td class="num">${entry.basis >= 0 ? '+' : ''}${money(entry.basis, i18n.locale)}</td>
              <td class="num">${money(entry.margin, i18n.locale)}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="chart-note muted">${t('futures.chainNote', { size: FUTURES_MULTIPLIER })}</p>`,
    });
  }

  function ticketCard(state) {
    const data = ticketData(state);
    const contract = data.contract;
    return card({
      className: 'ticket-card',
      title: t('futures.ticketTitle'),
      subtitle: t('futures.ticketSubtitle'),
      body: `
        <div class="ticket">
          ${segmented({
            options: [{ value: 'long', label: t('futures.long') }, { value: 'short', label: t('futures.short') }],
            active: side,
            attr: 'fut-side',
            className: 'ticket__side ticket__side--buy',
          })}
          <div class="ticket__field">
            <span class="field-label">${t('futures.contracts')}</span>
            <div class="qty-row">
              <input class="input" id="fut-qty" type="number" min="1" step="1" value="${qty}" inputmode="numeric">
              <button class="btn btn--ghost btn--sm" type="button" data-fut-max="max">${t('trade.max')}</button>
            </div>
            <span class="field-hint">${t('futures.cashAvailable', { value: money(data.room, i18n.locale) })}</span>
          </div>
          <div class="estimate-grid">
            <div class="estimate-row"><span>${t('futures.price')}</span><strong>${contract ? money(contract.price, i18n.locale) : '—'}</strong></div>
            <div class="estimate-row"><span>${t('futures.notional')}</span><strong>${contract ? money(contract.price * FUTURES_MULTIPLIER * data.quantity, i18n.locale) : '—'}</strong></div>
            <div class="estimate-row estimate-row--total"><span>${t('futures.marginRequired')}</span><strong id="fut-margin">${money(data.margin, i18n.locale)}</strong></div>
          </div>
          ${data.error ? `<p class="inline-warning">${data.error}</p>` : ''}
          <button class="btn btn--primary btn--block" type="button" id="fut-submit" ${data.error ? 'disabled' : ''}>${t('futures.openButton')}</button>
          <p class="ticket__risk">${t('futures.feeNote', { fee: money(state.settings.commission, i18n.locale) })}</p>
        </div>`,
    });
  }

  function positionsCard(state) {
    const rows = futuresPositionRows(state.account);
    return card({
      title: t('futures.positionsTitle'),
      subtitle: t('futures.positionsSubtitle', { count: rows.length }),
      body: rows.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr>
              <th>${t('futures.contract')}</th><th>${t('futures.contracts')}</th>
              <th>${t('futures.entry')}</th><th>${t('futures.current')}</th>
              <th>${t('futures.pnl')}</th><th>${t('futures.margin')}</th><th></th>
            </tr></thead>
            <tbody>${rows.map((row) => `
              <tr>
                <td><span class="ticker-cell"><strong>${row.ticker} · ${row.side === 'long' ? t('futures.long') : t('futures.short')}</strong><span>${t('options.expiryShort', { day: row.expiryDay })}</span></span></td>
                <td class="num">${num(row.qty, i18n.locale, 0)}</td>
                <td class="num">${money(row.entryPrice, i18n.locale)}</td>
                <td class="num" data-fut-price="${row.key}">${money(row.currentPrice, i18n.locale)}</td>
                <td class="num ${row.unrealized > 0 ? 'up' : row.unrealized < 0 ? 'down' : ''}" data-fut-pnl="${row.key}">${signedMoney(row.unrealized, i18n.locale)}</td>
                <td class="num">${money(row.margin, i18n.locale)}</td>
                <td><button class="link-btn" type="button" data-close-future="${row.key}">${t('futures.close')}</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('futures.noPositions')}</p>`,
    });
  }

  function template(state) {
    if (!isToolUnlocked(state, 'trade.futures')) return lockedTemplate(state);
    const companies = unlockedCompanies(state);
    return `
      <div class="futures-page">
        ${pageHead({
          eyebrow: t('futures.eyebrow'),
          title: t('futures.title'),
          subtitle: t('futures.subtitle'),
          actions: `
            <select class="input input--select" id="fut-ticker">
              ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === ticker ? 'selected' : ''}>${company.ticker} · ${companyName(ctx, company.ticker)}</option>`).join('')}
            </select>
            ${segmented({
              options: EXPIRIES.map((days) => ({ value: String(days), label: t('options.expiryOption', { days }) })),
              active: String(expiryDays),
              attr: 'fut-expiry',
            })}`,
        })}
        ${chainCard(state)}
        <div class="options-grid">
          ${ticketCard(state)}
          ${positionsCard(state)}
        </div>
        <div class="callout callout--tip">
          <span class="callout__label">${t('futures.educationTitle')}</span>
          <p>${t('futures.educationText', {
            margin: money(futuresMargin(state.account), i18n.locale),
          })}</p>
        </div>
        <div class="callout callout--warning">
          <span class="callout__label">${t('futures.boundaryTitle')}</span>
          <p>${t('futures.boundaryText')}</p>
        </div>
      </div>`;
  }

  function patchPositions(state) {
    for (const row of futuresPositionRows(state.account)) {
      const price = container.querySelector(`[data-fut-price="${row.key}"]`);
      if (price) price.textContent = money(row.currentPrice, i18n.locale);
      const pnl = container.querySelector(`[data-fut-pnl="${row.key}"]`);
      if (pnl) {
        pnl.textContent = signedMoney(row.unrealized, i18n.locale);
        pnl.classList.toggle('up', row.unrealized > 0);
        pnl.classList.toggle('down', row.unrealized < 0);
      }
    }
    const quote = state.market.quotes[ticker];
    const spot = container.querySelector('#fut-spot');
    if (spot && quote) spot.textContent = t('futures.spotLabel', { value: money(quote.last, i18n.locale) });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) { router.go(go.dataset.go); return; }
      const expiry = event.target.closest('[data-fut-expiry]');
      if (expiry) { expiryDays = Number(expiry.dataset.futExpiry) || 30; render(store.get()); return; }
      const sideButton = event.target.closest('[data-fut-side]');
      if (sideButton) { side = sideButton.dataset.futSide; render(store.get()); return; }
      const max = event.target.closest('[data-fut-max]');
      if (max) {
        const data = ticketData(store.get());
        const per = data.contract ? data.contract.margin : 0;
        const affordable = per > 0 ? Math.max(0, Math.floor((data.room - data.fee) / per)) : 0;
        qty = String(affordable);
        const input = container.querySelector('#fut-qty');
        if (input) input.value = qty;
        render(store.get());
        return;
      }
      const close = event.target.closest('[data-close-future]');
      if (close) {
        const row = futuresPositionRows(store.get().account).find((entry) => entry.key === close.dataset.closeFuture);
        if (row) actions.closeFutureContract(row.key, row.qty);
        return;
      }
      if (event.target.closest('#fut-submit')) {
        const data = ticketData(store.get());
        if (data.error) { ctx.toast(data.error, 'error'); return; }
        const result = actions.openFutureContract({
          ticker, expiryDays, side, qty: data.quantity,
        });
        if (result?.ok) render(store.get());
      }
    });
    root.addEventListener('change', (event) => {
      if (event.target.id === 'fut-ticker') {
        ticker = event.target.value;
        render(store.get());
      }
      if (event.target.id === 'fut-qty') {
        qty = event.target.value;
        render(store.get());
      }
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
  }

  function onTick(state) {
    if (!isToolUnlocked(state, 'trade.futures')) return;
    patchPositions(state);
  }

  function destroy() {}

  return { mount, render, onTick, destroy };
}
