/**
 * Options desk: deterministic chains, a long-only buy ticket, model Greeks and
 * open positions that settle at expiry.
 */
import { money, num, pct, signedMoney } from '../../core/format.js';
import { pageHead, card, segmented } from '../kit.js';
import { emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { getCompany } from '../../data/companies.js';
import { unlockedCompanies, isCompanyUnlocked } from '../../market/marketAccess.js';
import { buildOptionChain, chainRows, findContract } from '../../options/chains.js';
import { CONTRACT_SIZE, payoffAtExpiry } from '../../options/pricing.js';
import { optionPositionRows } from '../../options/optionsEngine.js';
import { isToolUnlocked } from '../../education/unlockManager.js';
import { availableCash } from '../../trading/account.js';
import { companyName } from '../labels.js';

const EXPIRY_OPTIONS = [30, 60, 90];

export function createOptionsView(ctx) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;
  let ticker = null;
  let expiryDays = 30;
  let selected = { type: 'call', strike: null };
  let qty = '1';

  function currentTicker(state) {
    if (ticker && isCompanyUnlocked(state, ticker)) return ticker;
    const companies = unlockedCompanies(state);
    ticker = companies[0] ? companies[0].ticker : 'AURA';
    return ticker;
  }

  function chainFor(state) {
    const company = getCompany(currentTicker(state));
    const quote = state.market.quotes[ticker];
    if (!company || !quote) return null;
    return buildOptionChain(company, quote, state.market.day);
  }

  function ensureSelection(chain) {
    if (!chain) return;
    if (!chain.strikes.includes(selected.strike)) {
      const nearest = chain.strikes.reduce((best, strike) => (
        Math.abs(strike - chain.spot) < Math.abs(best - chain.spot) ? strike : best
      ), chain.strikes[0]);
      selected.strike = nearest;
    }
  }

  function selectedContract(state) {
    const chain = chainFor(state);
    if (!chain) return null;
    ensureSelection(chain);
    const expiry = chain.expiries.find((entry) => entry.days === expiryDays) || chain.expiries[0];
    return findContract(chain, {
      type: selected.type,
      strike: selected.strike,
      expiryDay: expiry.expiryDay,
    });
  }

  function ticketData(state) {
    const contract = selectedContract(state);
    const quantity = Math.max(0, Math.floor(Number(qty) || 0));
    const fee = state.settings.commission;
    const cash = availableCash(state.account, state.orders, fee);
    const cost = contract ? contract.premium * CONTRACT_SIZE * quantity + fee : 0;
    let error = '';
    if (!contract) error = t('options.noContract');
    else if (quantity <= 0) error = t('trade.validation.qty');
    else if (cost > cash + 1e-9) error = t('trade.validation.cash');
    const payoff = contract
      ? payoffAtExpiry({
        type: contract.type,
        spot: contract.spot,
        strike: contract.strike,
        premium: contract.premium,
        qty: quantity,
      })
      : null;
    return {
      contract,
      quantity,
      fee,
      cash,
      cost,
      error,
      payoff,
    };
  }

  function chainCard(state) {
    const chain = chainFor(state);
    if (!chain) return '';
    ensureSelection(chain);
    const expiry = chain.expiries.find((entry) => entry.days === expiryDays) || chain.expiries[0];
    const rows = chainRows(chain, expiry.expiryDay);
    return card({
      title: t('options.chainTitle'),
      subtitle: t('options.chainSubtitle', { ticker, days: expiryDays }),
      actions: `<span class="pill" id="opt-spot">${t('options.spotLabel', { value: money(chain.spot, i18n.locale) })}</span>`,
      body: `
        <div class="table-wrap"><table class="table options-chain">
          <thead><tr>
            <th>${t('options.strike')}</th>
            <th class="num">${t('options.call')}</th>
            <th class="num">${t('options.delta')}</th>
            <th class="num">${t('options.put')}</th>
            <th class="num">${t('options.delta')}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="${selected.strike === row.strike ? 'is-selected' : ''}">
                <td class="num">${money(row.strike, i18n.locale)}</td>
                <td class="num">${row.call ? money(row.call.premium, i18n.locale) : '—'}</td>
                <td class="num muted">${row.call ? num(row.call.delta, i18n.locale, 2) : '—'}</td>
                <td class="num">${row.put ? money(row.put.premium, i18n.locale) : '—'}</td>
                <td class="num muted">${row.put ? num(row.put.delta, i18n.locale, 2) : '—'}</td>
                <td class="options-chain__actions">
                  <button class="link-btn" type="button" data-option-type="call" data-strike="${row.strike}">${t('options.selectCall')}</button>
                  <button class="link-btn" type="button" data-option-type="put" data-strike="${row.strike}">${t('options.selectPut')}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>
        <p class="chart-note muted">${t('options.chainNote')}</p>`,
    });
  }

  function ticketCard(state) {
    const data = ticketData(state);
    const contract = data.contract;
    if (!contract) {
      return card({
        title: t('options.ticketTitle'),
        body: `<p class="muted">${t('options.noContract')}</p>`,
      });
    }
    return card({
      className: 'ticket-card',
      title: t('options.ticketTitle'),
      subtitle: t('options.ticketSubtitle'),
      body: `
        <div class="ticket">
          <div class="option-contract">
            <span class="pill pill--ok">${t(`options.${contract.type}`)}</span>
            <strong>${ticker} · ${money(contract.strike, i18n.locale)}</strong>
            <span class="muted">${t('options.expiryIn', { days: contract.days })}</span>
          </div>
          <div class="ticket__field">
            <span class="field-label">${t('options.contracts')}</span>
            <div class="qty-row">
              <input class="input" id="opt-qty" type="number" min="1" step="1" value="${qty}" inputmode="numeric">
              <button class="btn btn--ghost btn--sm" type="button" data-opt-qty="max">${t('trade.max')}</button>
            </div>
            <span class="field-hint">${t('options.contractSize', { size: CONTRACT_SIZE })} · ${t('options.cashAvailable', { value: money(data.cash, i18n.locale) })}</span>
          </div>
          ${estimateHtml(state)}
          <button class="btn btn--primary btn--block" type="button" id="opt-submit" ${data.error ? 'disabled' : ''}>${t('options.buyButton')}</button>
          <p class="ticket__risk">${t('options.feeNote', { fee: money(state.settings.commission, i18n.locale) })}</p>
        </div>`,
    });
  }

  function estimateHtml(state) {
    const data = ticketData(state);
    const contract = data.contract;
    if (!contract) return '';
    const expiryText = t('options.ticketBreakeven', { value: money(data.payoff.breakeven, i18n.locale) });
    return `
      <div class="estimate-grid">
        <div class="estimate-row"><span>${t('options.premium')}</span><strong id="opt-premium">${money(contract.premium, i18n.locale)} × 100</strong></div>
        <div class="estimate-row"><span>${t('trade.estimateGross')}</span><strong id="opt-gross">${money(contract.premium * CONTRACT_SIZE * data.quantity, i18n.locale)}</strong></div>
        <div class="estimate-row"><span>${t('trade.commission')}</span><strong id="opt-fee">${money(data.fee, i18n.locale)}</strong></div>
        <div class="estimate-row estimate-row--total"><span>${t('options.totalCost')}</span><strong id="opt-cost">${money(data.cost, i18n.locale)}</strong></div>
        <div class="estimate-row"><span>${t('options.breakeven')}</span><strong>${money(data.payoff.breakeven, i18n.locale)}</strong></div>
      </div>
      <div class="greeks-grid">
        <div class="demo-result"><span>Δ ${t('options.delta')}</span><strong>${num(contract.delta, i18n.locale, 3)}</strong></div>
        <div class="demo-result"><span>Γ ${t('options.gamma')}</span><strong>${num(contract.gamma, i18n.locale, 4)}</strong></div>
        <div class="demo-result"><span>Θ ${t('options.theta')}</span><strong>${money(contract.theta, i18n.locale, 2)}</strong></div>
        <div class="demo-result"><span>Vega</span><strong>${num(contract.vega, i18n.locale, 2)}</strong></div>
      </div>
      <p class="inline-warning" id="opt-warning" ${data.error ? '' : 'hidden'}>${data.error}</p>
      <p class="estimate-note">${expiryText}</p>`;
  }

  function positionsCard(state) {
    const rows = optionPositionRows(state.account, state.market.day);
    return card({
      title: t('options.positionsTitle'),
      subtitle: t('options.positionsSubtitle', { count: rows.length }),
      body: rows.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr>
              <th>${t('options.contract')}</th><th>${t('options.contracts')}</th>
              <th>${t('options.avgPremium')}</th><th>${t('options.currentValue')}</th>
              <th>${t('options.pnl')}</th><th>${t('options.daysLeft')}</th><th></th>
            </tr></thead>
            <tbody>${rows.map((row) => `
              <tr>
                <td><span class="ticker-cell"><strong>${row.ticker} ${row.type === 'call' ? t('options.call') : t('options.put')}</strong><span>${money(row.strike, i18n.locale)} · ${t('options.expiryShort', { day: row.expiryDay })}</span></span></td>
                <td class="num">${num(row.qty, i18n.locale, 0)}</td>
                <td class="num">${money(row.premium, i18n.locale)}</td>
                <td class="num" data-opt-value="${row.key}">${money(row.value, i18n.locale)}</td>
                <td class="num ${row.pnl > 0 ? 'up' : row.pnl < 0 ? 'down' : ''}" data-opt-pnl="${row.key}">${signedMoney(row.pnl, i18n.locale)} · ${pct(row.pnlPct, i18n.locale, 1)}</td>
                <td class="num" data-opt-days="${row.key}">${t('options.daysLeftValue', { days: row.daysLeft })}</td>
                <td><button class="link-btn" type="button" data-close-option="${row.key}">${t('options.close')}</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('options.noPositions')}</p>`,
    });
  }

  function lockedTemplate(state) {
    return `
      <div class="options-page">
        ${pageHead({
          eyebrow: t('options.eyebrow'),
          title: t('options.title'),
          subtitle: t('options.subtitle'),
        })}
        ${card({
          className: 'locked-card',
          body: `
            <div class="locked-card__icon">${icon('lock', { size: 26 })}</div>
            <h2>${t('options.lockedTitle')}</h2>
            <p>${t('options.lockedText')}</p>
            <button class="btn btn--primary" type="button" data-go="/academy/u21/s1">${t('options.lockedAction')}</button>`,
        })}
      </div>`;
  }

  function template(state) {
    if (!isToolUnlocked(state, 'options.trade')) return lockedTemplate(state);
    const chain = chainFor(state);
    const companies = unlockedCompanies(state);
    const expiry = chain ? chain.expiries.find((entry) => entry.days === expiryDays) : null;
    return `
      <div class="options-page">
        ${pageHead({
          eyebrow: t('options.eyebrow'),
          title: t('options.title'),
          subtitle: t('options.subtitle'),
          actions: `
            <select class="input input--select" id="opt-ticker">
              ${companies.map((company) => `<option value="${company.ticker}" ${company.ticker === ticker ? 'selected' : ''}>${company.ticker} · ${companyName(ctx, company.ticker)}</option>`).join('')}
            </select>
            ${segmented({
              options: EXPIRY_OPTIONS.map((days) => ({ value: String(days), label: t('options.expiryOption', { days }) })),
              active: String(expiryDays),
              attr: 'opt-expiry',
            })}`,
        })}
        ${chainCard(state)}
        <div class="options-grid">
          ${ticketCard(state)}
          ${positionsCard(state)}
        </div>
        <div class="callout callout--tip">
          <span class="callout__label">${t('options.educationTitle')}</span>
          <p>${t('options.educationText', {
            vol: chain ? pct(chain.vol * 100, i18n.locale, 1, false) : '—',
            expiry: expiry ? expiry.expiryDay : 0,
          })}</p>
        </div>
      </div>`;
  }

  function refreshTicket(state) {
    const data = ticketData(state);
    const set = (id, value) => {
      const node = container.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    set('opt-gross', money((data.contract ? data.contract.premium : 0) * CONTRACT_SIZE * data.quantity, i18n.locale));
    set('opt-fee', money(data.fee, i18n.locale));
    set('opt-cost', money(data.cost, i18n.locale));
    const submit = container.querySelector('#opt-submit');
    if (submit) submit.disabled = Boolean(data.error);
    const warning = container.querySelector('#opt-warning');
    if (warning) {
      warning.textContent = data.error;
      warning.toggleAttribute('hidden', !data.error);
    }
  }

  function patchPositions(state) {
    const rows = optionPositionRows(state.account, state.market.day);
    for (const row of rows) {
      const value = container.querySelector(`[data-opt-value="${row.key}"]`);
      if (value) value.textContent = money(row.value, i18n.locale);
      const pnl = container.querySelector(`[data-opt-pnl="${row.key}"]`);
      if (pnl) {
        pnl.textContent = `${signedMoney(row.pnl, i18n.locale)} · ${pct(row.pnlPct, i18n.locale, 1)}`;
        pnl.classList.toggle('up', row.pnl > 0);
        pnl.classList.toggle('down', row.pnl < 0);
      }
      const days = container.querySelector(`[data-opt-days="${row.key}"]`);
      if (days) days.textContent = t('options.daysLeftValue', { days: row.daysLeft });
    }
    const quote = state.market.quotes[ticker];
    const spot = container.querySelector('#opt-spot');
    if (spot && quote) spot.textContent = money(quote.last, i18n.locale);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) {
        router.go(go.dataset.go);
        return;
      }
      const pick = event.target.closest('[data-option-type]');
      if (pick) {
        selected = { type: pick.dataset.optionType, strike: Number(pick.dataset.strike) };
        render(store.get());
        return;
      }
      const expiry = event.target.closest('[data-opt-expiry]');
      if (expiry) {
        expiryDays = Number(expiry.dataset.optExpiry) || 30;
        render(store.get());
        return;
      }
      const close = event.target.closest('[data-close-option]');
      if (close) {
        const position = optionPositionRows(store.get().account, store.get().market.day)
          .find((row) => row.key === close.dataset.closeOption);
        if (position) actions.closeOptionContract(position.key, position.qty);
        return;
      }
      const max = event.target.closest('[data-opt-qty]');
      if (max) {
        const data = ticketData(store.get());
        const price = data.contract ? data.contract.premium * CONTRACT_SIZE : 0;
        if (price > 0) {
          const affordable = Math.max(0, Math.floor((data.cash - data.fee) / price));
          qty = String(affordable);
          const input = container.querySelector('#opt-qty');
          if (input) input.value = qty;
          refreshTicket(store.get());
        }
      }
    });
    root.addEventListener('change', (event) => {
      if (event.target.id === 'opt-ticker') {
        ticker = event.target.value;
        selected.strike = null;
        render(store.get());
      }
    });
    root.addEventListener('input', (event) => {
      if (event.target.id === 'opt-qty') {
        qty = event.target.value;
        refreshTicket(store.get());
      }
    });
    root.addEventListener('click', (event) => {
      if (event.target.closest('#opt-submit')) {
        const state = store.get();
        const data = ticketData(state);
        if (data.error || !data.contract) {
          ctx.toast(data.error || t('options.noContract'), 'error');
          return;
        }
        const result = actions.buyOptionContract({
          ticker,
          type: data.contract.type,
          strike: data.contract.strike,
          expiryDay: data.contract.expiryDay,
          qty: data.quantity,
        });
        if (result?.ok) render(store.get());
      }
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
  }

  function onTick(state) {
    if (!isToolUnlocked(state, 'options.trade')) return;
    patchPositions(state);
  }

  function destroy() {}

  return { mount, render, onTick, destroy };
}
