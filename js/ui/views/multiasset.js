/**
 * Multi-asset desk: fixed income and FX paper trading with deterministic macro
 * pricing. Positions live on the same cash account as stocks.
 */
import { money, num, pct, signedMoney } from '../../core/format.js';
import { pageHead, card, statCard } from '../kit.js';
import { icon } from '../icons.js';
import { isUnitComplete } from '../../education/lessonEngine.js';
import { macroWorld } from '../../market/macro.js';
import {
  BOND_DEFS, bondQuoteRows, bondValue, bondUnrealized, BOND_FACE,
} from '../../assets/bonds.js';
import { FX_PAIRS, fxRates, fxValue, fxUnrealized } from '../../assets/fx.js';

export function createMultiAssetView(ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;

  function lockedCard() {
    return card({
      className: 'multiasset-locked',
      title: t('multiasset.lockedTitle'),
      subtitle: t('multiasset.lockedText'),
      body: `
        <p class="muted">${t('multiasset.lockedHint')}</p>
        <div class="button-row">
          <button class="btn btn--primary" type="button" data-go="/academy/u13">${icon('academy', { size: 15 })} ${t('multiasset.goAcademy')}</button>
        </div>`,
    });
  }

  function marketContext(state) {
    const macro = macroWorld(state.market.day, state.seed);
    const bonds = bondQuoteRows(macro);
    const rates = fxRates(state.market.day, state.seed, macro);
    return { macro, bonds, rates };
  }

  function summary(state, context) {
    return `
      <div class="stat-grid">
        ${statCard({ label: t('multiasset.bondValue'), value: money(bondValue(state.account), i18n.locale), sub: t('multiasset.bondUnrealized', { value: signedMoney(bondUnrealized(state.account), i18n.locale) }), tone: bondUnrealized(state.account) >= 0 ? 'up' : 'down', iconName: 'portfolio' })}
        ${statCard({ label: t('multiasset.fxValue'), value: money(fxValue(state.account, context.rates), i18n.locale), sub: t('multiasset.fxUnrealized', { value: signedMoney(fxUnrealized(state.account, context.rates), i18n.locale) }), tone: fxUnrealized(state.account, context.rates) >= 0 ? 'up' : 'down', iconName: 'market' })}
        ${statCard({ label: t('multiasset.cash'), value: money(state.account.cash, i18n.locale), sub: t('multiasset.cashSub'), iconName: 'sparkle' })}
      </div>`;
  }

  function bondMarketCard(state, context) {
    const rows = context.bonds.map((bond) => `
      <tr>
        <td><strong>${t(bond.nameKey)}</strong><span class="fund-sub">${t(bond.issuerKey)} · ${t(`multiasset.rating.${bond.rating || 'gov'}`)}</span></td>
        <td class="num">${bond.years}Y</td>
        <td class="num">${pct(bond.coupon, i18n.locale, 2, false)}</td>
        <td class="num">${pct(bond.yieldPct, i18n.locale, 2, false)}</td>
        <td class="num">${money(bond.price, i18n.locale)}</td>
      </tr>`).join('');
    return card({
      className: 'multiasset-bonds',
      title: t('multiasset.bondTitle'),
      subtitle: t('multiasset.bondSubtitle'),
      body: `
        <div class="multiasset-form">
          <select class="input input--select" data-bond-select aria-label="${t('multiasset.bond')}">
            ${context.bonds.map((bond) => `<option value="${bond.id}">${t(bond.nameKey)} · ${money(bond.price, i18n.locale)}</option>`).join('')}
          </select>
          <input class="input" type="number" min="1" step="1" value="1" data-bond-qty aria-label="${t('multiasset.qty')}">
          <button class="btn btn--primary btn--sm" type="button" data-bond-buy>${t('multiasset.buyBond')}</button>
        </div>
        <div class="table-wrap"><table class="table table--compact">
          <thead><tr>
            <th>${t('multiasset.bond')}</th><th class="num">${t('multiasset.duration')}</th>
            <th class="num">${t('multiasset.coupon')}</th><th class="num">${t('multiasset.yield')}</th>
            <th class="num">${t('multiasset.price')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="chart-note muted">${t('multiasset.bondNote', { face: money(BOND_FACE, i18n.locale) })}</p>`,
    });
  }

  function bondPositionsCard(state, context) {
    const positions = state.account.bonds || [];
    const rows = positions.map((position) => {
      const bond = BOND_DEFS.find((entry) => entry.id === position.id);
      const value = position.qty * (position.currentPrice || 0);
      const pnl = value - (position.costBasis || 0);
      return `<tr>
        <td>${bond ? t(bond.nameKey) : position.id}</td>
        <td class="num">${num(position.qty, i18n.locale, 0)}</td>
        <td class="num">${money(position.costBasis / Math.max(1, position.qty), i18n.locale)}</td>
        <td class="num">${money(position.currentPrice || 0, i18n.locale)}</td>
        <td class="num">${money(value, i18n.locale)}</td>
        <td class="num ${pnl >= 0 ? 'up' : 'down'}">${signedMoney(pnl, i18n.locale)}</td>
        <td><button class="link-btn" type="button" data-bond-sell="${position.id}">${t('multiasset.sellAll')}</button></td>
      </tr>`;
    }).join('');
    return card({
      className: 'multiasset-bond-positions',
      title: t('multiasset.bondPositionsTitle'),
      subtitle: t('multiasset.bondPositionsSubtitle'),
      body: positions.length
        ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>${t('multiasset.bond')}</th><th class="num">${t('multiasset.qty')}</th><th class="num">${t('multiasset.avgCost')}</th><th class="num">${t('multiasset.price')}</th><th class="num">${t('multiasset.value')}</th><th class="num">${t('multiasset.pnl')}</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<p class="muted">${t('multiasset.noBondPositions')}</p>`,
    });
  }

  function fxMarketCard(state, context) {
    const rows = FX_PAIRS.map((pair) => `
      <tr>
        <td><strong>${pair.id}</strong><span class="fund-sub">${t(pair.nameKey)}</span></td>
        <td class="num">${num(context.rates[pair.id], i18n.locale, 4)}</td>
        <td class="num">${pct((context.rates[pair.id] / pair.base - 1) * 100, i18n.locale, 2)}</td>
      </tr>`).join('');
    return card({
      className: 'multiasset-fx',
      title: t('multiasset.fxTitle'),
      subtitle: t('multiasset.fxSubtitle'),
      body: `
        <div class="multiasset-form">
          <select class="input input--select" data-fx-select aria-label="${t('multiasset.pair')}">
            ${FX_PAIRS.map((pair) => `<option value="${pair.id}">${pair.id} · ${t(pair.nameKey)}</option>`).join('')}
          </select>
          <input class="input" type="number" min="1" step="1" value="1000" data-fx-units aria-label="${t('multiasset.units')}">
          <button class="btn btn--primary btn--sm" type="button" data-fx-buy>${t('multiasset.buyFx')}</button>
        </div>
        <div class="table-wrap"><table class="table table--compact">
          <thead><tr><th>${t('multiasset.pair')}</th><th class="num">${t('multiasset.rate')}</th><th class="num">${t('multiasset.change')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="chart-note muted">${t('multiasset.fxNote')}</p>`,
    });
  }

  function fxPositionsCard(state, context) {
    const positions = state.account.fx || [];
    const rows = positions.map((position) => {
      const pair = FX_PAIRS.find((entry) => entry.id === position.id);
      const rate = context.rates[position.id] || position.currentRate || 0;
      const value = position.units * rate;
      const pnl = value - (position.costBasis || 0);
      return `<tr>
        <td>${pair ? pair.id : position.id}<span class="fund-sub">${pair ? t(pair.nameKey) : ''}</span></td>
        <td class="num">${num(position.units, i18n.locale, 0)}</td>
        <td class="num">${num(position.costBasis / Math.max(1, position.units), i18n.locale, 4)}</td>
        <td class="num">${num(rate, i18n.locale, 4)}</td>
        <td class="num">${money(value, i18n.locale)}</td>
        <td class="num ${pnl >= 0 ? 'up' : 'down'}">${signedMoney(pnl, i18n.locale)}</td>
        <td><button class="link-btn" type="button" data-fx-sell="${position.id}">${t('multiasset.sellAll')}</button></td>
      </tr>`;
    }).join('');
    return card({
      className: 'multiasset-fx-positions',
      title: t('multiasset.fxPositionsTitle'),
      subtitle: t('multiasset.fxPositionsSubtitle'),
      body: positions.length
        ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>${t('multiasset.pair')}</th><th class="num">${t('multiasset.units')}</th><th class="num">${t('multiasset.avgCost')}</th><th class="num">${t('multiasset.rate')}</th><th class="num">${t('multiasset.value')}</th><th class="num">${t('multiasset.pnl')}</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<p class="muted">${t('multiasset.noFxPositions')}</p>`,
    });
  }

  function template(state) {
    const unlocked = isUnitComplete(state, 'u13');
    const context = marketContext(state);
    return `
      <div class="multiasset-page">
        ${pageHead({
          eyebrow: t('multiasset.eyebrow'),
          title: t('multiasset.title'),
          subtitle: t('multiasset.subtitle'),
          actions: `<span class="pill">${icon('portfolio', { size: 14 })} ${t('multiasset.pill')}</span>`,
        })}
        ${!unlocked
          ? lockedCard()
          : `${summary(state, context)}
            <div class="multiasset-split">${bondMarketCard(state, context)}${bondPositionsCard(state, context)}</div>
            <div class="multiasset-split">${fxMarketCard(state, context)}${fxPositionsCard(state, context)}</div>`}
        <p class="chart-note muted">${t('multiasset.note')}</p>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const buyBond = event.target.closest('[data-bond-buy]');
      if (buyBond) {
        const bondId = container.querySelector('[data-bond-select]')?.value;
        const qty = Number(container.querySelector('[data-bond-qty]')?.value);
        actions.buyBondAsset(bondId, qty);
        return;
      }
      const sellBond = event.target.closest('[data-bond-sell]');
      if (sellBond) {
        const position = (store.get().account.bonds || []).find((entry) => entry.id === sellBond.dataset.bondSell);
        actions.sellBondAsset(sellBond.dataset.bondSell, position?.qty || 0);
        return;
      }
      const buyFx = event.target.closest('[data-fx-buy]');
      if (buyFx) {
        const pairId = container.querySelector('[data-fx-select]')?.value;
        const units = Number(container.querySelector('[data-fx-units]')?.value);
        actions.buyFxAsset(pairId, units);
        return;
      }
      const sellFx = event.target.closest('[data-fx-sell]');
      if (sellFx) {
        const position = (store.get().account.fx || []).find((entry) => entry.id === sellFx.dataset.fxSell);
        actions.sellFxAsset(sellFx.dataset.fxSell, position?.units || 0);
      }
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
  }

  function destroy() {
    // no dynamic resources
  }

  return { mount, render, destroy };
}
