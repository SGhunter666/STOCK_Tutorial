/**
 * Trading view: quote, price chart, order ticket, open orders and trade history.
 * Beginner mode hides advanced analytics; advanced mode exposes spreads,
 * fundamentals and reservation details.
 */
import {
  money, num, pct, signedMoney, compactNumber, moneyCompact,
} from '../../core/format.js';
import { pageHead, card, segmented } from '../kit.js';
import { emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { CandlestickChart } from '../chart.js';
import { getCompany, fundamentalsFor } from '../../data/companies.js';
import {
  availableShares, availableShortShares, positionOf, reservedCash,
  buyingPower, shortCapacity,
} from '../../trading/account.js';
import { estimateOrder, ORDER_STATUS } from '../../trading/orderEngine.js';
import { buildOrderBook, estimateMarketFill } from '../../market/orderBook.js';
import { formatMarketDate } from '../../market/calendar.js';
import { nextDividendDay, dividendPerShare } from '../../market/dividends.js';
import { indicatorSnapshot } from '../../market/indicators.js';
import { financialsFor } from '../../data/financials.js';
import { styleOf, styleLabelKey } from '../../data/stockTypes.js';
import { isToolUnlocked } from '../../education/unlockManager.js';
import { openLockedToolModal } from '../components.js';
import {
  isCompanyUnlocked, companySegment, unlockedCompanies,
} from '../../market/marketAccess.js';
import { getUnit } from '../../education/curriculum.js';
import { companyName, companyDesc, sectorLabel, unitLabel } from '../labels.js';

const drafts = new Map();

export function createTradeView(ctx, { ticker }) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, p) => i18n.t(key, p);
  const layout = () => store.get().settings.layout;
  const symbol = ticker && getCompany(ticker) ? ticker : 'AURA';
  const company = getCompany(symbol);
  let root;
  let container;
  let chart = null;

  function draft() {
    if (!drafts.has(symbol)) {
      const quote = store.get().market.quotes[symbol];
      drafts.set(symbol, {
        side: 'buy',
        type: 'market',
        qty: '10',
        limit: (Math.round(quote.last * 0.99 * 100) / 100).toFixed(2),
        stop: (Math.round(quote.last * 0.95 * 100) / 100).toFixed(2),
        trail: '5.00',
      });
    }
    const d = drafts.get(symbol);
    if (d.stop === undefined) d.stop = (Math.round(store.get().market.quotes[symbol].last * 0.95 * 100) / 100).toFixed(2);
    if (d.trail === undefined) d.trail = '5.00';
    return d;
  }

  function marketState(state) {
    const quote = state.market.quotes[symbol];
    const position = positionOf(state.account, symbol);
    const fee = state.settings.commission;
    const d = draft();
    const unlockedLimit = isToolUnlocked(state, 'order.limit');
    const shortUnlocked = isToolUnlocked(state, 'trade.short');
    const stopUnlocked = isToolUnlocked(state, 'order.stop');
    const marginUnlocked = isToolUnlocked(state, 'trade.margin');
    const power = buyingPower(state.account, state.market.quotes, {
      marginEnabled: marginUnlocked, fee, orders: state.orders,
    });
    const sellable = availableShares(state.account, state.orders, symbol);
    const shortable = shortCapacity(state.account, state.market.quotes, quote.bid);
    const shortShares = availableShortShares(state.account, symbol);
    return {
      quote, position, fee, d, unlockedLimit, shortUnlocked, stopUnlocked, marginUnlocked,
      buyingPower: power, sellable, shortable, shortShares,
    };
  }

  function ticketEstimate(state) {
    const {
      quote, fee, d, buyingPower, sellable, shortable, shortShares, position,
    } = marketState(state);
    const qty = Math.max(0, Math.floor(Number(d.qty) || 0));
    const limit = Number(d.limit) || 0;
    const stop = Number(d.stop) || 0;
    const trail = Number(d.trail) || 0;
    const input = {
      ticker: symbol, side: d.side, type: d.type, qty, limitPrice: limit, stopPrice: stop, trailAmount: trail,
    };
    const estimate = estimateOrder({ input, quote, fee });
    let error = '';
    const conditional = d.type === 'stop' || d.type === 'trailing';
    if (qty <= 0) error = t('trade.validation.qty');
    else if (d.type === 'limit' && limit <= 0) error = t('trade.validation.limit');
    else if (d.type === 'stop' && stop <= 0) error = t('trade.validation.stop');
    else if (d.type === 'trailing' && trail <= 0) error = t('trade.validation.trail');
    else if (d.type === 'stop' && ((d.side === 'buy' || d.side === 'cover') ? stop < quote.last : stop > quote.last)) {
      error = t('trade.validation.stopDirection');
    } else if (!conditional) {
      if (d.side === 'buy' || d.side === 'cover') {
        const required = d.type === 'limit' ? qty * limit + fee : qty * quote.ask + fee;
        if (required > buyingPower + 1e-9) error = t('trade.validation.cash');
      } else if (d.side === 'sell' && qty > sellable) {
        error = t('trade.validation.shares');
      } else if (d.side === 'short' && qty > shortable) {
        error = t('trade.validation.margin');
      }
      if (!error && d.side === 'cover' && qty > shortShares) error = t('trade.validation.shortShares');
    }
    return {
      qty, limit, stop, trail, estimate, error, buyingPower, sellable, shortable, shortShares,
      quote, fee, d, position,
    };
  }

  function quoteStrip(state) {
    const q = state.market.quotes[symbol];
    const spread = Math.max(0, q.ask - q.bid);
    return `
      <div class="quote-strip">
        <div class="quote-strip__price">
          <span class="quote-strip__label">${t('market.last')}</span>
          <strong class="quote-strip__last" id="quote-last">${money(q.last, i18n.locale)}</strong>
          <span class="delta ${q.changePct > 0 ? 'up' : q.changePct < 0 ? 'down' : 'flat'}" id="quote-change">${pct(q.changePct, i18n.locale, 2)}</span>
        </div>
        <div class="quote-strip__cell"><span>${t('market.bid')}</span><strong id="quote-bid">${money(q.bid, i18n.locale)}</strong></div>
        <div class="quote-strip__cell"><span>${t('market.ask')}</span><strong id="quote-ask">${money(q.ask, i18n.locale)}</strong></div>
        <div class="quote-strip__cell"><span>${t('market.spread')}</span><strong id="quote-spread">${money(spread, i18n.locale)}</strong></div>
        <div class="quote-strip__cell"><span>${t('market.dayRange')}</span><strong id="quote-range">${money(q.low, i18n.locale)} – ${money(q.high, i18n.locale)}</strong></div>
        <div class="quote-strip__cell"><span>${t('market.volume')}</span><strong id="quote-volume">${compactNumber(q.volume, i18n.locale)}</strong></div>
      </div>`;
  }

  function chartCard(state) {
    const position = positionOf(state.account, symbol);
    const advanced = layout() === 'advanced';
    const days = advanced ? 90 : 45;
    return card({
      title: t('trade.chartTitle'),
      subtitle: t('trade.chartSubtitle'),
      actions: `<span class="pill">${t('trade.chartRange', { days })}</span>`,
      body: `
        <div class="chart-wrap"><canvas id="price-chart" style="height:${advanced ? 300 : 250}px"></canvas></div>
        ${position.qty !== 0 ? `<p class="chart-note">${t('trade.avgCostLine', { cost: money(position.avgCost, i18n.locale), qty: num(Math.abs(position.qty), i18n.locale, 0) })}</p>` : ''}
        <p class="chart-note muted">${t('trade.candleNote')}</p>`,
    });
  }

  function ticketCard(state) {
    const est = ticketEstimate(state);
    const d = est.d;
    const quote = est.quote;
    const unlockedLimit = isToolUnlocked(state, 'order.limit');
    const shortUnlocked = isToolUnlocked(state, 'trade.short');
    const stopUnlocked = isToolUnlocked(state, 'order.stop');
    const position = est.position;
    if (!shortUnlocked && (d.side === 'short' || d.side === 'cover')) d.side = 'buy';
    if (!stopUnlocked && (d.type === 'stop' || d.type === 'trailing')) d.type = 'market';
    if (!unlockedLimit && d.type === 'limit') d.type = 'market';
    const sideOptions = [
      { value: 'buy', label: t('trade.buy') },
      { value: 'sell', label: t('trade.sell') },
    ];
    if (shortUnlocked) sideOptions.push({ value: 'short', label: t('trade.short') });
    if (shortUnlocked && position.side === 'short') sideOptions.push({ value: 'cover', label: t('trade.cover') });
    const typeOptions = [
      { value: 'market', label: t('trade.marketOrder') },
      { value: 'limit', label: `${t('trade.limitOrder')} ${unlockedLimit ? '' : icon('lock', { size: 12 })}`, title: unlockedLimit ? '' : t('trade.limitLocked') },
    ];
    if (stopUnlocked) {
      typeOptions.push({ value: 'stop', label: t('trade.stopOrder') });
      typeOptions.push({ value: 'trailing', label: t('trade.trailingOrder') });
    }
    const hint = d.side === 'buy'
      ? t('trade.buyingPower', { value: money(est.buyingPower, i18n.locale) })
      : d.side === 'sell'
        ? t('trade.sellable', { value: num(est.sellable, i18n.locale, 0) })
        : d.side === 'short'
          ? t('trade.shortable', { value: num(est.shortable, i18n.locale, 0) })
          : t('trade.shortPositionHint', { value: num(est.shortShares, i18n.locale, 0) });
    return card({
      className: 'ticket-card',
      title: t('trade.orderTicket'),
      subtitle: t('trade.orderTicketSubtitle'),
      body: `
        <div class="ticket">
          ${segmented({
            options: sideOptions,
            active: d.side,
            attr: 'side',
            className: `ticket__side ticket__side--${d.side}`,
          })}
          ${!shortUnlocked ? `<p class="field-hint">${t('trade.shortLockedHint')}</p>` : ''}
          <div class="ticket__field">
            <span class="field-label">${t('trade.orderType')}</span>
            ${segmented({
              options: typeOptions,
              active: d.type,
              attr: 'type',
              className: 'ticket__types',
            })}
            ${!stopUnlocked ? `<p class="field-hint">${t('trade.stopLockedHint')}</p>` : ''}
          </div>
          <div class="ticket__field">
            <span class="field-label">${t('trade.quantity')}</span>
            <div class="qty-row">
              <input class="input" id="order-qty" type="number" min="1" step="1" value="${d.qty}" inputmode="numeric">
              <button class="btn btn--ghost btn--sm" type="button" data-qty="max">${t('trade.max')}</button>
            </div>
            <span class="field-hint">${hint}</span>
          </div>
          ${d.type === 'limit' ? `
          <div class="ticket__field">
            <span class="field-label">${t('trade.limitPrice')}</span>
            <div class="qty-row">
              <input class="input" id="order-limit" type="number" min="0.01" step="0.01" value="${d.limit}" inputmode="decimal">
              <button class="btn btn--ghost btn--sm" type="button" data-limit="bid">${t('market.bid')}</button>
              <button class="btn btn--ghost btn--sm" type="button" data-limit="ask">${t('market.ask')}</button>
            </div>
          </div>` : ''}
          ${d.type === 'stop' ? `
          <div class="ticket__field">
            <span class="field-label">${t('trade.stopPrice')}</span>
            <div class="qty-row">
              <input class="input" id="order-stop" type="number" min="0.01" step="0.01" value="${d.stop}" inputmode="decimal">
              <button class="btn btn--ghost btn--sm" type="button" data-stop="last">${t('market.last')}</button>
            </div>
          </div>` : ''}
          ${d.type === 'trailing' ? `
          <div class="ticket__field">
            <span class="field-label">${t('trade.trailAmount')}</span>
            <div class="qty-row">
              <input class="input" id="order-trail" type="number" min="0.01" step="0.01" value="${d.trail}" inputmode="decimal">
            </div>
            <span class="field-hint">${t('trade.trailHint')}</span>
          </div>` : ''}
          <div class="estimate" id="order-estimate">${estimateHtml(state)}</div>
          <p class="ticket__message" id="order-message"></p>
          <button class="btn btn--primary btn--block" type="button" id="order-submit" ${est.error ? 'disabled' : ''}>${t(`trade.submit${d.side[0].toUpperCase() + d.side.slice(1)}`)}</button>
          <p class="ticket__risk">${t('trade.feeNote', { fee: money(state.settings.commission, i18n.locale) })}</p>
          ${layout() === 'beginner' ? `<ul class="ticket__explain">
            <li>${t(`trade.explain.${d.side}.${d.type}`)}</li>
            <li>${t('trade.explain.always')}</li>
          </ul>` : `
          <div class="ticket__advanced">
            <span>${t('trade.reservedCash', { value: money(reservedCash(state.orders, state.settings.commission), i18n.locale) })}</span>
            <span>${t('trade.spreadCost', { value: money(Math.max(0, quote.ask - quote.bid), i18n.locale) })}</span>
            ${state.account.cash < 0 ? `<span>${t('trade.marginDebt', { value: money(-state.account.cash, i18n.locale) })}</span>` : ''}
          </div>`}
        </div>`,
    });
  }

  function estimateHtml(state) {
    const est = ticketEstimate(state);
    const buySide = est.d.side === 'buy' || est.d.side === 'cover';
    const shortSide = est.d.side === 'short';
    const conditional = est.d.type === 'stop' || est.d.type === 'trailing';
    const trailingStop = est.d.type === 'trailing'
      ? (buySide ? est.quote.last + Number(est.d.trail) : est.quote.last - Number(est.d.trail))
      : est.stop;
    return `
      <div class="estimate-grid">
        <div class="estimate-row"><span>${conditional ? t('trade.estimateTrigger') : t('trade.estimatePrice')}</span><strong id="est-price">${money(conditional ? trailingStop : est.estimate.execPrice, i18n.locale)}</strong></div>
        <div class="estimate-row"><span>${t('trade.estimateGross')}</span><strong id="est-gross">${money(est.estimate.gross, i18n.locale)}</strong></div>
        <div class="estimate-row"><span>${t('trade.commission')}</span><strong id="est-fee">${money(est.estimate.fee, i18n.locale)}</strong></div>
        <div class="estimate-row estimate-row--total"><span>${buySide ? t('trade.estimateTotal') : t('trade.estimateNet')}</span><strong id="est-total">${money(est.estimate.total, i18n.locale)}</strong></div>
        ${shortSide ? `<div class="estimate-row"><span>${t('trade.estimateMargin')}</span><strong>${money(est.estimate.gross * 0.5, i18n.locale)}</strong></div>` : ''}
        ${buySide && !conditional ? `<div class="estimate-row"><span>${t('trade.afterPower')}</span><strong id="est-after">${money(est.buyingPower - est.estimate.total, i18n.locale)}</strong></div>` : ''}
      </div>
      ${est.error ? `<p class="inline-warning">${est.error}</p>` : ''}
      <p class="estimate-note">${conditional ? t('trade.estimateNoteConditional') : est.d.type === 'limit' ? t('trade.estimateNoteLimit') : t('trade.estimateNoteMarket')}</p>`;
  }

  function indicatorsCard(state) {
    const quote = state.market.quotes[symbol];
    const snapshot = indicatorSnapshot(state.market.history[symbol], quote.last);
    const trendKey = snapshot?.trend === 'up' ? 'trade.trendUp'
      : snapshot?.trend === 'down' ? 'trade.trendDown'
        : snapshot?.trend === 'flat' ? 'trade.trendFlat' : 'trade.trendUnknown';
    return card({
      title: t('trade.indicatorsTitle'),
      subtitle: t('trade.indicatorsSubtitle'),
      body: snapshot
        ? `<div class="table-wrap"><table class="table"><tbody>
            <tr><td>${t('trade.sma20')}</td><td class="num">${snapshot.sma20 ? money(snapshot.sma20, i18n.locale) : '—'}</td></tr>
            <tr><td>${t('trade.sma50')}</td><td class="num">${snapshot.sma50 ? money(snapshot.sma50, i18n.locale) : '—'}</td></tr>
            <tr><td>${t('trade.rsi14')}</td><td class="num">${snapshot.rsi14 ? num(snapshot.rsi14, i18n.locale, 1) : '—'}</td></tr>
            <tr><td>${t('trade.trend')}</td><td class="num">${t(trendKey)}</td></tr>
            <tr><td>${t('trade.volatility')}</td><td class="num">${snapshot.volatility ? pct(snapshot.volatility, i18n.locale, 1, false) : '—'}</td></tr>
            <tr><td>${t('trade.drawdown')}</td><td class="num down">${snapshot.drawdown ? pct(snapshot.drawdown, i18n.locale, 1, false) : '—'}</td></tr>
          </tbody></table></div><p class="chart-note muted">${t('trade.indicatorsNote')}</p>`
        : `<p class="muted">${t('trade.indicatorsEmpty')}</p>`,
    });
  }

  function financialsCard(state) {
    const f = financialsFor(company);
    return card({
      title: t('trade.financialsTitle'),
      subtitle: t('trade.financialsSubtitle'),
      body: f
        ? `<div class="table-wrap"><table class="table"><tbody>
            <tr><td>${t('trade.revenue')}</td><td class="num">${moneyCompact(f.revenue, i18n.locale)}</td></tr>
            <tr><td>${t('trade.grossProfit')}</td><td class="num">${moneyCompact(f.grossProfit, i18n.locale)}</td></tr>
            <tr><td>${t('trade.netIncome')}</td><td class="num">${moneyCompact(f.netIncome, i18n.locale)}</td></tr>
            <tr><td>${t('trade.netMargin')}</td><td class="num">${pct(f.netMargin * 100, i18n.locale, 1, false)}</td></tr>
            <tr><td>${t('trade.assets')}</td><td class="num">${moneyCompact(f.assets, i18n.locale)}</td></tr>
            <tr><td>${t('trade.liabilities')}</td><td class="num">${moneyCompact(f.liabilities, i18n.locale)}</td></tr>
            <tr><td>${t('trade.equity')}</td><td class="num">${moneyCompact(f.equity, i18n.locale)}</td></tr>
            <tr><td>${t('trade.freeCashFlow')}</td><td class="num">${moneyCompact(f.freeCashFlow, i18n.locale)}</td></tr>
          </tbody></table></div><p class="chart-note muted">${t('trade.financialsNote')}</p>`
        : `<p class="muted">${t('trade.indicatorsEmpty')}</p>`,
    });
  }

  function companyCard(state) {
    const quote = state.market.quotes[symbol];
    const f = fundamentalsFor(company, quote.last);
    const advanced = layout() === 'advanced';
    const dps = dividendPerShare(company);
    const nextPay = dps > 0 ? nextDividendDay(company, state.market.day) : null;
    const style = styleOf(symbol);
    return card({
      title: t('trade.companyTitle'),
      subtitle: t('trade.companySubtitle'),
      body: `
        <p class="company-desc">${companyDesc(ctx, symbol)}</p>
        <dl class="kv">
          <div class="kv__row"><dt>${t('market.sector')}</dt><dd>${sectorLabel(ctx, company.sector)}</dd></div>
          <div class="kv__row"><dt>${t('trade.stockStyle')}</dt><dd>${style ? t(styleLabelKey(style)) : '—'}</dd></div>
          <div class="kv__row"><dt>${t('market.marketCap')}</dt><dd>${moneyCompact(f.marketCap, i18n.locale)}</dd></div>
          <div class="kv__row"><dt>${t('trade.dividendYield')}</dt><dd>${company.dividendYield ? pct(company.dividendYield, i18n.locale, 2, false) : t('trade.noDividend')}</dd></div>
          <div class="kv__row"><dt>${t('trade.dividendPerShare')}</dt><dd>${dps > 0 ? money(dps, i18n.locale) : '—'}</dd></div>
          <div class="kv__row"><dt>${t('trade.nextDividend')}</dt><dd>${nextPay ? t('trade.inDays', { days: nextPay - state.market.day }) : '—'}</dd></div>
          ${advanced ? `
          <div class="kv__row"><dt>${t('trade.sharesOutstanding')}</dt><dd>${compactNumber(f.sharesOutstanding, i18n.locale)}</dd></div>
          <div class="kv__row"><dt>${t('trade.revenue')}</dt><dd>${moneyCompact(f.revenue, i18n.locale)}</dd></div>
          <div class="kv__row"><dt>${t('trade.netIncome')}</dt><dd>${moneyCompact(f.netIncome, i18n.locale)}</dd></div>
          <div class="kv__row"><dt>${t('trade.eps')}</dt><dd>${money(f.eps, i18n.locale)}</dd></div>
          <div class="kv__row"><dt>${t('trade.pe')}</dt><dd>${f.pe ? num(f.pe, i18n.locale, 1) : '—'}</dd></div>
          <div class="kv__row"><dt>${t('trade.pb')}</dt><dd>${num(f.pb, i18n.locale, 1)}</dd></div>` : `<div class="kv__row"><dt>${t('trade.fundamentalsLocked')}</dt><dd>${t('trade.unlockStage3')}</dd></div>`}
        </dl>`,
    });
  }

  function ordersCard(state) {
    const orders = state.orders.filter((order) => order.ticker === symbol);
    const open = orders.filter((order) => order.status === ORDER_STATUS.open);
    const rows = orders.slice(0, 8).map((order) => `
      <tr>
        <td><span class="side-tag side-tag--${order.side}">${t(`trade.${order.side}`)}</span></td>
        <td>${t(`trade.${order.type}Order`)}</td>
        <td class="num">${num(order.qty, i18n.locale, 0)}</td>
        <td class="num">${order.limitPrice ? money(order.limitPrice, i18n.locale) : order.stopPrice ? money(order.stopPrice, i18n.locale) : '—'}</td>
        <td><span class="status-pill status-pill--${order.status}">${t(`order.status.${order.status}`)}</span></td>
        <td class="num">${order.fillPrice ? money(order.fillPrice, i18n.locale) : '—'}</td>
        <td class="num">${order.createdAt && Number.isFinite(order.createdAt.day) ? formatMarketDate(order.createdAt.day, i18n.locale) : '—'}</td>
        <td>${order.status === ORDER_STATUS.open ? `<button class="link-btn" type="button" data-cancel="${order.id}">${t('trade.cancel')}</button>` : ''}</td>
      </tr>`);
    return card({
      title: t('trade.ordersTitle'),
      subtitle: t('trade.ordersSubtitle', { open: open.length, total: orders.length }),
      body: orders.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr>
              <th>${t('trade.side')}</th><th>${t('trade.orderType')}</th><th>${t('trade.quantity')}</th><th>${t('trade.triggerPrice')}</th>
              <th>${t('trade.status')}</th><th>${t('trade.fillPrice')}</th><th>${t('trade.placed')}</th><th></th>
            </tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('trade.noOrders')}</p>`,
    });
  }

  function tradesCard(state) {
    const trades = state.account.trades.slice(0, 8);
    return card({
      title: t('trade.tradesTitle'),
      subtitle: t('trade.tradesSubtitle'),
      body: trades.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${t('trade.side')}</th><th>${t('trade.ticker')}</th><th>${t('trade.quantity')}</th><th>${t('trade.price')}</th><th>${t('trade.fee')}</th><th>${t('trade.realized')}</th><th>${t('trade.date')}</th></tr></thead>
            <tbody>${trades.map((trade) => `
              <tr>
                <td><span class="side-tag side-tag--${trade.side}">${t(`trade.${trade.side}`)}</span></td>
                <td>${trade.ticker}</td>
                <td class="num">${num(trade.qty, i18n.locale, 0)}</td>
                <td class="num">${money(trade.price, i18n.locale)}</td>
                <td class="num">${money(trade.fee, i18n.locale)}</td>
                <td class="num ${trade.realized > 0 ? 'up' : trade.realized < 0 ? 'down' : ''}">${trade.side === 'sell' || trade.side === 'cover' ? signedMoney(trade.realized, i18n.locale) : '—'}</td>
                <td class="num">${formatMarketDate(trade.day, i18n.locale)}</td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('trade.noTrades')}</p>`,
    });
  }

  function depthCard(state) {
    if (!isToolUnlocked(state, 'market.depth')) {
      return card({
        title: t('trade.depthTitle'),
        subtitle: t('trade.depthSubtitle'),
        body: `<p class="muted">${t('trade.depthLocked')}</p>
          <button class="btn btn--ghost btn--sm" type="button" data-go="/academy/u20/s1">${t('trade.depthUnlock')}</button>`,
      });
    }
    const quote = state.market.quotes[symbol];
    const book = buildOrderBook(quote, { levels: 5 });
    const est = ticketEstimate(state);
    const buySide = est.d.side === 'buy' || est.d.side === 'cover';
    const fill = estimateMarketFill(book, buySide ? 'buy' : 'sell', Math.max(1, est.qty));
    const rows = [
      ...book.asks.slice().reverse().map((level) => ({ ...level, side: 'ask' })),
      ...book.bids.map((level) => ({ ...level, side: 'bid' })),
    ];
    return card({
      title: t('trade.depthTitle'),
      subtitle: t('trade.depthSubtitle'),
      actions: `<span class="pill">${t('trade.depthLevels', { count: 5 })}</span>`,
      body: `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>${t('trade.side')}</th><th>${t('trade.price')}</th><th>${t('trade.depthSize')}</th></tr></thead>
          <tbody>${rows.map((row) => `<tr>
            <td><span class="side-tag side-tag--${row.side === 'ask' ? 'sell' : 'buy'}">${row.side === 'ask' ? t('demo.orderBook.ask') : t('demo.orderBook.bid')}</span></td>
            <td class="num">${money(row.price, i18n.locale)}</td>
            <td class="num">${num(row.size, i18n.locale, 0)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="estimate-grid">
          <div class="estimate-row"><span>${t('trade.depthAvg')}</span><strong>${fill.filledQty ? money(fill.avgPrice, i18n.locale) : '—'}</strong></div>
          <div class="estimate-row"><span>${t('trade.depthSlippage')}</span><strong>${pct(fill.slippagePct, i18n.locale, 2, false)}</strong></div>
          <div class="estimate-row"><span>${t('trade.depthFilled')}</span><strong>${num(fill.filledQty, i18n.locale, 0)} / ${num(est.qty, i18n.locale, 0)}</strong></div>
        </div>
        <p class="chart-note muted">${t('trade.depthNote')}</p>`,
    });
  }

  function template(state) {
    const advanced = layout() === 'advanced';
    const position = positionOf(state.account, symbol);
    const available = unlockedCompanies(state);
    const quote = state.market.quotes[symbol];
    const positionPnl = position.qty > 0
      ? position.qty * quote.last - position.costBasis
      : position.costBasis + position.qty * quote.last;
    return `
      <div class="trade-page">
        ${pageHead({
          eyebrow: `${t('trade.eyebrow')} · ${t('market.virtualCompany')}`,
          title: `${symbol} · ${companyName(ctx, symbol)}`,
          subtitle: companyDesc(ctx, symbol),
          actions: `
            <select class="input input--select" id="symbol-select">
              ${available.map((c) => `<option value="${c.ticker}" ${c.ticker === symbol ? 'selected' : ''}>${c.ticker} · ${companyName(ctx, c.ticker)}</option>`).join('')}
            </select>
            ${segmented({
              options: [{ value: 'beginner', label: t('settings.beginner') }, { value: 'advanced', label: t('settings.advanced') }],
              active: layout(),
              attr: 'layout',
            })}
            <button class="btn btn--ghost btn--sm" type="button" data-go="/portfolio">${icon('portfolio', { size: 15 })} ${t('nav.portfolio')}</button>`,
        })}
        ${quoteStrip(state)}
        <div class="trade-grid">
          ${chartCard(state)}
          ${ticketCard(state)}
        </div>
        ${position.qty !== 0 ? `
        <div class="position-strip">
          <div><span class="muted">${t('trade.positionLabel')} · ${t(`trade.${position.side}`)}</span><strong>${num(Math.abs(position.qty), i18n.locale, 0)} × ${money(position.avgCost, i18n.locale)}</strong></div>
          <div><span class="muted">${t('trade.positionValue')}</span><strong>${money(position.qty * quote.last, i18n.locale)}</strong></div>
          <div><span class="muted">${t('trade.positionPnl')}</span><strong class="${positionPnl >= 0 ? 'up' : 'down'}">${signedMoney(positionPnl, i18n.locale)}</strong></div>
          <button class="link-btn" type="button" data-go="/portfolio">${t('portfolio.title')} ${icon('arrowRight', { size: 14 })}</button>
        </div>` : ''}
        <div class="trade-lower">
          ${ordersCard(state)}
          ${tradesCard(state)}
        </div>
        ${advanced ? `<div class="trade-lower">${indicatorsCard(state)}${financialsCard(state)}</div>${depthCard(state)}` : ''}
        <div class="trade-bottom">
          ${companyCard(state)}
          <div class="aside-block aside-block--tip trade-tip">
            <span class="field-label">${t('trade.tipLabel')}</span>
            <p class="muted">${t('trade.tipText')}</p>
            <button class="link-btn" type="button" data-go="/glossary">${t('nav.glossary')} ${icon('arrowRight', { size: 14 })}</button>
          </div>
        </div>
      </div>`;
  }

  function updateChart(state) {
    if (!chart) return;
    const quote = state.market.quotes[symbol];
    const advanced = layout() === 'advanced';
    const history = state.market.history[symbol].slice(-(advanced ? 90 : 45));
    const candles = [...history, { o: quote.open, h: quote.high, l: quote.low, c: quote.last, v: quote.volume }];
    const position = positionOf(state.account, symbol);
    chart.setData({
      candles,
      markers: position.qty !== 0
        ? [{
          value: position.avgCost,
          label: position.side === 'short' ? t('trade.shortMarker') : t('trade.avgCostMarker'),
          color: position.side === 'short' ? 'rgba(244,114,182,0.9)' : 'rgba(245,183,80,0.85)',
        }]
        : [],
      labels: [
        formatMarketDate(history[0].d, i18n.locale),
        t('common.today'),
      ],
    });
  }

  function patchLive(state) {
    const q = state.market.quotes[symbol];
    const set = (id, value, cls) => {
      const node = container.querySelector(`#${id}`);
      if (!node) return;
      node.textContent = value;
      if (cls) {
        node.classList.toggle('up', cls === 'up');
        node.classList.toggle('down', cls === 'down');
        node.classList.toggle('flat', cls === 'flat');
      }
    };
    set('quote-last', money(q.last, i18n.locale));
    set('quote-bid', money(q.bid, i18n.locale));
    set('quote-ask', money(q.ask, i18n.locale));
    set('quote-spread', money(Math.max(0, q.ask - q.bid), i18n.locale));
    set('quote-range', `${money(q.low, i18n.locale)} – ${money(q.high, i18n.locale)}`);
    set('quote-volume', compactNumber(q.volume, i18n.locale));
    set('quote-change', pct(q.changePct, i18n.locale, 2), q.changePct > 0 ? 'up' : q.changePct < 0 ? 'down' : 'flat');
    refreshEstimate(state);
    updateChart(state);
  }

  function refreshEstimate(state) {
    const estimateNode = container.querySelector('#order-estimate');
    if (!estimateNode) return;
    const d = draft();
    d.qty = container.querySelector('#order-qty')?.value ?? d.qty;
    if (container.querySelector('#order-limit')) d.limit = container.querySelector('#order-limit').value;
    estimateNode.innerHTML = estimateHtml(state);
    const message = container.querySelector('#order-message');
    if (message) {
      const est = ticketEstimate(state);
      message.textContent = est.error || '';
      message.classList.toggle('is-error', Boolean(est.error));
      const submit = container.querySelector('#order-submit');
      if (submit) submit.disabled = Boolean(est.error);
    }
  }

  function bind(state) {
    container.querySelector('#symbol-select')?.addEventListener('change', (event) => {
      router.go(`/trade/${event.target.value}`);
    });
    container.querySelectorAll('[data-side]').forEach((button) => {
      button.addEventListener('click', () => {
        const d = draft();
        d.side = button.dataset.side;
        if (d.type === 'stop') {
          const q = store.get().market.quotes[symbol];
          const above = d.side === 'buy' || d.side === 'cover';
          d.stop = (q.last * (above ? 1.05 : 0.95)).toFixed(2);
        }
        render(store.get());
      });
    });
    container.querySelectorAll('[data-type]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.type === 'limit' && !isToolUnlocked(store.get(), 'order.limit')) {
          openLockedToolModal('order.limit');
          return;
        }
        if ((button.dataset.type === 'stop' || button.dataset.type === 'trailing')
          && !isToolUnlocked(store.get(), 'order.stop')) {
          openLockedToolModal('order.stop');
          return;
        }
        const d = draft();
        d.type = button.dataset.type;
        if (d.type === 'stop') {
          const q = store.get().market.quotes[symbol];
          const above = d.side === 'buy' || d.side === 'cover';
          d.stop = (q.last * (above ? 1.05 : 0.95)).toFixed(2);
        }
        render(store.get());
      });
    });
    container.querySelectorAll('[data-layout]').forEach((button) => {
      button.addEventListener('click', () => actions.setLayout(button.dataset.layout));
    });
    container.querySelectorAll('[data-qty]').forEach((button) => {
      button.addEventListener('click', () => {
        const est = ticketEstimate(store.get());
        const quote = store.get().market.quotes[symbol];
        const fee = store.get().settings.commission;
        const price = est.d.type === 'market'
          ? (est.d.side === 'buy' || est.d.side === 'cover' ? quote.ask : quote.bid)
          : est.d.type === 'limit' ? Number(est.d.limit) || 0 : quote.last;
        if (price <= 0) return;
        let max = 0;
        if (est.d.side === 'buy') max = Math.max(0, Math.floor((est.buyingPower - fee) / price));
        else if (est.d.side === 'sell') max = est.sellable;
        else if (est.d.side === 'short') max = est.shortable;
        else if (est.d.side === 'cover') max = est.shortShares;
        draft().qty = String(max);
        const input = container.querySelector('#order-qty');
        if (input) input.value = String(max);
        refreshEstimate(store.get());
      });
    });
    container.querySelectorAll('[data-limit]').forEach((button) => {
      button.addEventListener('click', () => {
        const q = store.get().market.quotes[symbol];
        const value = button.dataset.limit === 'bid' ? q.bid : q.ask;
        draft().limit = value.toFixed(2);
        const input = container.querySelector('#order-limit');
        if (input) input.value = draft().limit;
        refreshEstimate(store.get());
      });
    });
    container.querySelectorAll('[data-stop]').forEach((button) => {
      button.addEventListener('click', () => {
        const q = store.get().market.quotes[symbol];
        draft().stop = q.last.toFixed(2);
        const input = container.querySelector('#order-stop');
        if (input) input.value = draft().stop;
        refreshEstimate(store.get());
      });
    });
    container.querySelector('#order-qty')?.addEventListener('input', (event) => {
      draft().qty = event.target.value;
      refreshEstimate(store.get());
    });
    container.querySelector('#order-limit')?.addEventListener('input', (event) => {
      draft().limit = event.target.value;
      refreshEstimate(store.get());
    });
    container.querySelector('#order-stop')?.addEventListener('input', (event) => {
      draft().stop = event.target.value;
      refreshEstimate(store.get());
    });
    container.querySelector('#order-trail')?.addEventListener('input', (event) => {
      draft().trail = event.target.value;
      refreshEstimate(store.get());
    });
    container.querySelector('#order-submit')?.addEventListener('click', () => {
      const stateNow = store.get();
      const est = ticketEstimate(stateNow);
      if (est.error) {
        ctx.toast(est.error, 'warning');
        return;
      }
      const outcome = actions.submitOrder({
        ticker: symbol,
        side: est.d.side,
        type: est.d.type,
        qty: est.qty,
        limitPrice: est.limit,
        stopPrice: est.stop,
        trailAmount: est.trail,
      });
      if (outcome?.ok) {
        if (outcome.order?.status === ORDER_STATUS.open) {
          draft().type = 'market';
        }
        render(store.get());
      }
    });
    container.querySelectorAll('[data-cancel]').forEach((button) => {
      button.addEventListener('click', () => actions.cancelOrder(Number(button.dataset.cancel)));
    });
    container.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => router.go(button.dataset.go));
    });
  }

  function lockedTemplate(state) {
    const segment = companySegment(symbol);
    const unit = segment?.unlockUnit ? getUnit(segment.unlockUnit) : null;
    return `
      <div class="trade-page">
        ${pageHead({
          eyebrow: `${t('trade.eyebrow')} · ${t('market.virtualCompany')}`,
          title: `${symbol} · ${companyName(ctx, symbol)}`,
          subtitle: companyDesc(ctx, symbol),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/market">${icon('market', { size: 15 })} ${t('nav.market')}</button>`,
        })}
        <div class="card trade-locked">
          <div class="locked-feature__icon">${icon('lock', { size: 28 })}</div>
          <div class="locked-feature__body">
            <h2>${t('trade.lockedTitle')}</h2>
            <p>${t('trade.lockedText', {
              segment: segment ? t(segment.nameKey) : '',
              unit: unit ? unitLabel(ctx, unit) : '',
            })}</p>
            <div class="callout callout--tip">
              <span class="callout__label">${t('market.segmentUnlockHint', { unit: unit ? unitLabel(ctx, unit) : '' })}</span>
              <p>${t('trade.lockedNote')}</p>
            </div>
            <div class="button-row">
              <button class="btn btn--primary btn--sm" type="button" data-go="/market">${t('trade.backToMarket')}</button>
              ${unit ? `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}">${t('market.goUnlock')}</button>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    if (!company) {
      container.innerHTML = `<div class="trade-page">${pageHead({ title: t('trade.unknownTicker') })}</div>`;
      return;
    }
    if (!isCompanyUnlocked(state, symbol)) {
      container.innerHTML = lockedTemplate(state);
      container.querySelectorAll('[data-go]').forEach((button) => {
        button.addEventListener('click', () => router.go(button.dataset.go));
      });
      return;
    }
    const advanced = layout() === 'advanced';
    container.innerHTML = template(state);
    bind(state);
    if (chart) chart.destroy();
    const canvas = container.querySelector('#price-chart');
    chart = new CandlestickChart(canvas, {
      height: advanced ? 300 : 250,
      yFormat: (value) => money(value, i18n.locale),
      showVolume: true,
    });
    updateChart(state);
    refreshEstimate(state);
  }

  function onTick(state) {
    if (!container) return;
    patchLive(state);
  }

  function destroy() {
    if (chart) chart.destroy();
    chart = null;
  }

  return { mount, render, onTick, destroy };
}
