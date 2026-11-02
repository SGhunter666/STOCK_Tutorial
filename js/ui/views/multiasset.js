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
import {
  COMMODITY_DEFS, commodityQuotes, commodityValue, commodityUnrealized,
} from '../../assets/commodities.js';
import {
  CRYPTO_DEFS, cryptoQuotes, cryptoValue, cryptoUnrealized,
} from '../../assets/crypto.js';

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
    const previousMacro = macroWorld(Math.max(0, state.market.day - 1), state.seed);
    const bonds = bondQuoteRows(macro);
    const rates = fxRates(state.market.day, state.seed, macro);
    const previousRates = fxRates(Math.max(0, state.market.day - 1), state.seed, previousMacro);
    const commodities = commodityQuotes(state.market.day, state.seed, macro);
    const crypto = cryptoQuotes(state.market.day, state.seed, macro);
    return {
      macro, bonds, rates, previousRates, commodities, crypto,
    };
  }

  function summary(state, context) {
    const commodityPnl = commodityUnrealized(state.account);
    const cryptoPnl = cryptoUnrealized(state.account);
    return `
      <div class="stat-grid">
        ${statCard({ label: t('multiasset.bondValue'), value: money(bondValue(state.account), i18n.locale), sub: t('multiasset.bondUnrealized', { value: signedMoney(bondUnrealized(state.account), i18n.locale) }), tone: bondUnrealized(state.account) >= 0 ? 'up' : 'down', iconName: 'portfolio' })}
        ${statCard({ label: t('multiasset.fxValue'), value: money(fxValue(state.account, context.rates), i18n.locale), sub: t('multiasset.fxUnrealized', { value: signedMoney(fxUnrealized(state.account, context.rates), i18n.locale) }), tone: fxUnrealized(state.account, context.rates) >= 0 ? 'up' : 'down', iconName: 'market' })}
        ${statCard({ label: t('multiasset.commodityValue'), value: money(commodityValue(state.account), i18n.locale), sub: t('multiasset.commodityUnrealized', { value: signedMoney(commodityPnl, i18n.locale) }), tone: commodityPnl >= 0 ? 'up' : 'down', iconName: 'challenges' })}
        ${statCard({ label: t('multiasset.cryptoValue'), value: money(cryptoValue(state.account), i18n.locale), sub: t('multiasset.cryptoUnrealized', { value: signedMoney(cryptoPnl, i18n.locale) }), tone: cryptoPnl >= 0 ? 'up' : 'down', iconName: 'options' })}
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
    const rows = FX_PAIRS.map((pair) => {
      const previous = context.previousRates[pair.id] || pair.base;
      return `
      <tr>
        <td><strong>${pair.id}</strong><span class="fund-sub">${t(pair.nameKey)}</span></td>
        <td class="num">${num(context.rates[pair.id], i18n.locale, 4)}</td>
        <td class="num">${pct((context.rates[pair.id] / previous - 1) * 100, i18n.locale, 2)}</td>
      </tr>`;
    }).join('');
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

  function commodityMarketCard(state, context) {
    const rows = context.commodities.map((entry) => `
      <tr>
        <td><strong>${t(entry.nameKey)}</strong><span class="fund-sub">${t(entry.unitKey)}</span></td>
        <td class="num">${money(entry.price, i18n.locale)}</td>
        <td class="num ${entry.changePct >= 0 ? 'up' : 'down'}">${pct(entry.changePct, i18n.locale, 2)}</td>
      </tr>`).join('');
    return card({
      className: 'multiasset-commodities',
      title: t('multiasset.commodityTitle'),
      subtitle: t('multiasset.commoditySubtitle'),
      body: `
        <div class="multiasset-form">
          <select class="input input--select" data-commodity-select aria-label="${t('multiasset.commodity')}">
            ${context.commodities.map((entry) => `<option value="${entry.id}">${t(entry.nameKey)} · ${money(entry.price, i18n.locale)}</option>`).join('')}
          </select>
          <input class="input" type="number" min="1" step="1" value="1" data-commodity-qty aria-label="${t('multiasset.qty')}">
          <button class="btn btn--primary btn--sm" type="button" data-commodity-buy>${t('multiasset.buyCommodity')}</button>
        </div>
        <div class="table-wrap"><table class="table table--compact">
          <thead><tr><th>${t('multiasset.commodity')}</th><th class="num">${t('multiasset.price')}</th><th class="num">${t('multiasset.change')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="chart-note muted">${t('multiasset.commodityNote')}</p>`,
    });
  }

  function commodityPositionsCard(state) {
    const positions = state.account.commodities || [];
    const rows = positions.map((position) => {
      const definition = COMMODITY_DEFS.find((entry) => entry.id === position.id);
      const value = position.qty * (position.currentPrice || 0);
      const pnl = value - (position.costBasis || 0);
      return `<tr>
        <td>${definition ? t(definition.nameKey) : position.id}</td>
        <td class="num">${num(position.qty, i18n.locale, 0)}</td>
        <td class="num">${money(position.costBasis / Math.max(1, position.qty), i18n.locale)}</td>
        <td class="num">${money(position.currentPrice || 0, i18n.locale)}</td>
        <td class="num">${money(value, i18n.locale)}</td>
        <td class="num ${pnl >= 0 ? 'up' : 'down'}">${signedMoney(pnl, i18n.locale)}</td>
        <td><button class="link-btn" type="button" data-commodity-sell="${position.id}">${t('multiasset.sellAll')}</button></td>
      </tr>`;
    }).join('');
    return card({
      className: 'multiasset-commodity-positions',
      title: t('multiasset.commodityPositionsTitle'),
      subtitle: t('multiasset.commodityPositionsSubtitle'),
      body: positions.length
        ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>${t('multiasset.commodity')}</th><th class="num">${t('multiasset.qty')}</th><th class="num">${t('multiasset.avgCost')}</th><th class="num">${t('multiasset.price')}</th><th class="num">${t('multiasset.value')}</th><th class="num">${t('multiasset.pnl')}</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<p class="muted">${t('multiasset.noCommodityPositions')}</p>`,
    });
  }

  function cryptoMarketCard(state, context) {
    const rows = context.crypto.map((entry) => `
      <tr>
        <td><strong>${entry.id}</strong><span class="fund-sub">${t(entry.nameKey)}</span></td>
        <td class="num">${money(entry.price, i18n.locale)}</td>
        <td class="num ${entry.changePct >= 0 ? 'up' : 'down'}">${pct(entry.changePct, i18n.locale, 2)}</td>
      </tr>`).join('');
    return card({
      className: 'multiasset-crypto',
      title: t('multiasset.cryptoTitle'),
      subtitle: t('multiasset.cryptoSubtitle'),
      body: `
        <div class="multiasset-form">
          <select class="input input--select" data-crypto-select aria-label="${t('multiasset.crypto')}">
            ${context.crypto.map((entry) => `<option value="${entry.id}">${entry.id} · ${money(entry.price, i18n.locale)}</option>`).join('')}
          </select>
          <input class="input" type="number" min="0.000001" step="0.001" value="0.01" data-crypto-qty aria-label="${t('multiasset.units')}">
          <button class="btn btn--primary btn--sm" type="button" data-crypto-buy>${t('multiasset.buyCrypto')}</button>
        </div>
        <div class="table-wrap"><table class="table table--compact">
          <thead><tr><th>${t('multiasset.crypto')}</th><th class="num">${t('multiasset.price')}</th><th class="num">${t('multiasset.change')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="chart-note muted">${t('multiasset.cryptoNote')}</p>`,
    });
  }

  function cryptoPositionsCard(state) {
    const positions = state.account.crypto || [];
    const rows = positions.map((position) => {
      const definition = CRYPTO_DEFS.find((entry) => entry.id === position.id);
      const value = position.units * (position.currentPrice || 0);
      const pnl = value - (position.costBasis || 0);
      return `<tr>
        <td>${position.id}<span class="fund-sub">${definition ? t(definition.nameKey) : ''}</span></td>
        <td class="num">${num(position.units, i18n.locale, 4)}</td>
        <td class="num">${money(position.costBasis / Math.max(1e-9, position.units), i18n.locale)}</td>
        <td class="num">${money(position.currentPrice || 0, i18n.locale)}</td>
        <td class="num">${money(value, i18n.locale)}</td>
        <td class="num ${pnl >= 0 ? 'up' : 'down'}">${signedMoney(pnl, i18n.locale)}</td>
        <td><button class="link-btn" type="button" data-crypto-sell="${position.id}">${t('multiasset.sellAll')}</button></td>
      </tr>`;
    }).join('');
    return card({
      className: 'multiasset-crypto-positions',
      title: t('multiasset.cryptoPositionsTitle'),
      subtitle: t('multiasset.cryptoPositionsSubtitle'),
      body: positions.length
        ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>${t('multiasset.crypto')}</th><th class="num">${t('multiasset.units')}</th><th class="num">${t('multiasset.avgCost')}</th><th class="num">${t('multiasset.price')}</th><th class="num">${t('multiasset.value')}</th><th class="num">${t('multiasset.pnl')}</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<p class="muted">${t('multiasset.noCryptoPositions')}</p>`,
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
            <div class="multiasset-split">${fxMarketCard(state, context)}${fxPositionsCard(state, context)}</div>
            <div class="multiasset-split">${commodityMarketCard(state, context)}${commodityPositionsCard(state)}</div>
            <div class="multiasset-split">${cryptoMarketCard(state, context)}${cryptoPositionsCard(state)}</div>`}
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
        return;
      }
      const buyCommodity = event.target.closest('[data-commodity-buy]');
      if (buyCommodity) {
        const commodityId = container.querySelector('[data-commodity-select]')?.value;
        const qty = Number(container.querySelector('[data-commodity-qty]')?.value);
        actions.buyCommodityAsset(commodityId, qty);
        return;
      }
      const sellCommodity = event.target.closest('[data-commodity-sell]');
      if (sellCommodity) {
        const position = (store.get().account.commodities || [])
          .find((entry) => entry.id === sellCommodity.dataset.commoditySell);
        actions.sellCommodityAsset(sellCommodity.dataset.commoditySell, position?.qty || 0);
        return;
      }
      const buyCrypto = event.target.closest('[data-crypto-buy]');
      if (buyCrypto) {
        const cryptoId = container.querySelector('[data-crypto-select]')?.value;
        const qty = Number(container.querySelector('[data-crypto-qty]')?.value);
        actions.buyCryptoAsset(cryptoId, qty);
        return;
      }
      const sellCrypto = event.target.closest('[data-crypto-sell]');
      if (sellCrypto) {
        const position = (store.get().account.crypto || [])
          .find((entry) => entry.id === sellCrypto.dataset.cryptoSell);
        actions.sellCryptoAsset(sellCrypto.dataset.cryptoSell, position?.units || 0);
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
