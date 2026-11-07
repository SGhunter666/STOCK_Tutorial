/**
 * Phase 2-5 isolated "Simulated Exchange" view. It runs its own one-second
 * clock and order book and never touches the legacy 8-tick market or real data.
 */
import { pageHead, card, statCard, segmented, table } from '../kit.js';
import { CandlestickChart } from '../chart.js';
import { money, moneyCompact, compactNumber, num, pct } from '../../core/format.js';
import { toast } from '../components.js';
import { sectorLabel } from '../labels.js';
import { SIM_COMPANIES } from '../../sim/companies50.js';
import {
  createExchangeEngine, advanceSecond, advanceDay, getCandles, getBook,
  submitOrder, cancelOrder, equity, positionRows, openOrderRows, isTradingHalted,
  openRightsOfferings, subscribeRights, declineRights, availableCash,
  serializeExchange, deserializeExchange, simClock, simDate,
  latestReport, reportHistory, dividendPerShare, SIM_EXCHANGE_SAVE_KEY,
  submitOptionOrder, closeOptionPosition, submitBondOrder, submitOco,
  exerciseOptionPosition, startExchangeChallenge, abandonExchangeChallenge,
  exchangeChallengeSnapshot, exchangeTimelineRows, rewindToDay,
} from '../../sim/exchangeEngine.js';
import { SIM_MARGIN_CONFIG, marginSnapshot, shortRows } from '../../sim/margin.js';
import { SIM_ETFS, etfNav, etfHoldingsRows } from '../../sim/etfs.js';
import {
  SIM_OPTION_TENORS, buildOptionChain, optionRows, optionStrikeGrid,
} from '../../sim/options.js';
import { SIM_BONDS, bondQuotes, bondRows } from '../../sim/bonds.js';
import { SimulationClock, SIM_SPEEDS } from '../../sim/simulationClock.js';
import { nextMacroEventDay } from '../../sim/macroEconomy.js';
import { sectorSensitivity } from '../../sim/industryModel.js';
import { quarterLabel } from '../../sim/fundamentals.js';

const SAVE_KEY = SIM_EXCHANGE_SAVE_KEY;
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
const INSTRUMENTS = [
  ...SIM_COMPANIES.map((company) => ({ ticker: company.ticker, name: company.name, isEtf: false })),
  ...SIM_ETFS.map((etf) => ({ ticker: etf.ticker, name: etf.name, isEtf: true })),
];

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserializeExchange(raw) : createExchangeEngine({ seed: 'sim-exchange-v1' });
  } catch (error) {
    console.warn('[exchange] restore failed', error);
    return createExchangeEngine({ seed: 'sim-exchange-v1' });
  }
}

export function createExchangeView(ctx) {
  const { i18n, toast: notify, router } = ctx;
  let container = null;
  const t = (key, params) => i18n.t(key, params);
  const moneyFmt = (value) => money(value, i18n.locale);
  const numFmt = (value, digits = 0) => num(value, i18n.locale, digits);
  const pctFmt = (value, digits = 2) => pct(value, i18n.locale, digits);
  const pctPlain = (value, digits = 2) => pct(value, i18n.locale, digits, false);
  const signedNum = (value, digits = 1) => `${value > 0 ? '+' : ''}${numFmt(value, digits)}`;
  const macroValue = (type, value, signed = false) => {
    if (type === 'payrolls') return `${value > 0 && signed ? '+' : ''}${numFmt(value, 0)}K`;
    if (type === 'energy') return moneyFmt(value);
    if (type === 'cpi' || type === 'gdp' || type === 'centralBank') {
      return pct(value, i18n.locale, 2, signed);
    }
    return numFmt(value, 2);
  };
  const toastFn = notify || toast;
  let state = loadState();
  let selected = 'NCRT';
  let timeframe = '5m';
  let optionExpiryDays = 30;
  let optionFormKey = '';
  let timelineDay = null;
  let chart = null;
  let clock = null;
  let lastPaint = 0;
  let destroyed = false;

  function quote() {
    return state.quotes[selected];
  }

  function chartData() {
    const candles = getCandles(state, selected, timeframe);
    return {
      candles,
      labels: candles.length
        ? [candles[0].d || candles[0].time || '', candles[candles.length - 1].d || candles[candles.length - 1].time || '']
        : [],
    };
  }

  function chartNote() {
    const candles = getCandles(state, selected, timeframe);
    return t('exchange.chartNote', {
      count: candles.length,
      tf: t(`exchange.tf.${timeframe}`),
      time: simClock(state.second),
      date: simDate(state.dayIndex),
    });
  }

  function quoteHtml() {
    const q = quote();
    if (!q) return '';
    const bid = q.bid === null ? '—' : moneyFmt(q.bid);
    const ask = q.ask === null ? '—' : moneyFmt(q.ask);
    const halted = isTradingHalted(state, selected);
    const delisted = Boolean(state.companies[selected]?.delisted);
    const until = state.companies[selected]?.haltedUntilDay;
    return `
      <div class="exchange-quote">
        <div class="exchange-quote__main">
          <span class="pill pill--ok">${t('exchange.simBadge')}</span>
          <strong>${selected}</strong>
          <span class="muted">${state.companies[selected].company.name}</span>
          ${delisted
    ? `<span class="pill pill--warn">${t('exchange.delisted')}</span>`
    : halted ? `<span class="pill pill--warn">${t('exchange.halted', { date: simDate(until) })}</span>` : ''}
        </div>
        <div class="exchange-quote__price">${moneyFmt(q.last)}</div>
        <div class="delta ${q.changePct > 0 ? 'up' : q.changePct < 0 ? 'down' : 'flat'}">${pctFmt(q.changePct)}</div>
        <div class="exchange-quote__grid">
          <span>${t('exchange.bid')} <strong>${bid}</strong></span>
          <span>${t('exchange.ask')} <strong>${ask}</strong></span>
          <span>${t('exchange.volume')} <strong>${numFmt(q.volume)}</strong></span>
          <span>${t('exchange.fairValue')} <strong>${moneyFmt(q.fairValue)}</strong></span>
        </div>
      </div>`;
  }

  function bookHtml() {
    const book = getBook(state, selected, 6);
    const rows = [];
    for (let index = 5; index >= 0; index -= 1) {
      const level = book.asks[index];
      rows.push(level
        ? `<div class="exchange-book__row exchange-book__row--ask"><span>${moneyFmt(level.price)}</span><span>${numFmt(level.size)}</span></div>`
        : '<div class="exchange-book__row exchange-book__row--ask"><span>—</span><span>—</span></div>');
    }
    for (let index = 0; index < 6; index += 1) {
      const level = book.bids[index];
      rows.push(level
        ? `<div class="exchange-book__row exchange-book__row--bid"><span>${moneyFmt(level.price)}</span><span>${numFmt(level.size)}</span></div>`
        : '<div class="exchange-book__row exchange-book__row--bid"><span>—</span><span>—</span></div>');
    }
    return `<div class="exchange-book">
      <div class="exchange-book__head"><span>${t('exchange.price')}</span><span>${t('exchange.size')}</span></div>
      ${rows.join('')}
    </div>`;
  }

  function clockHtml() {
    return `<div class="exchange-clock">
      <span class="status-dot ${clock && clock.running ? 'is-live' : ''}"></span>
      <strong id="sim-clock">${simClock(state.second)}</strong>
      <span class="muted"><span id="sim-date">${simDate(state.dayIndex)}</span> · ${t('exchange.session')}</span>
    </div>`;
  }

  function controlsHtml() {
    return `<div class="exchange-controls">
      <button class="btn btn--primary" type="button" data-sim-play>${clock && clock.running ? t('exchange.pause') : t('exchange.play')}</button>
      ${Object.keys(SIM_SPEEDS).map((speed) => `<button class="speed-btn ${clock && clock.speed === Number(speed) ? 'is-active' : ''}" type="button" data-sim-speed="${speed}">${speed}×</button>`).join('')}
      <button class="btn" type="button" data-sim-step="1">${t('exchange.stepSecond')}</button>
      <button class="btn" type="button" data-sim-step="60">${t('exchange.stepMinute')}</button>
      <button class="btn" type="button" data-sim-step-day>${t('exchange.stepDay')}</button>
      <button class="btn" type="button" data-sim-save>${t('exchange.save')}</button>
      <button class="btn" type="button" data-sim-reset>${t('exchange.reset')}</button>
    </div>`;
  }

  function ticketHtml() {
    return `<form class="exchange-ticket" data-sim-form>
      <div class="exchange-ticket__row">
        <label>${t('exchange.ticker')}<select class="input input--select" data-sim-ticker>
          ${INSTRUMENTS.map((instrument) => `<option value="${instrument.ticker}" ${instrument.ticker === selected ? 'selected' : ''}>${instrument.ticker} · ${instrument.name}${instrument.isEtf ? ` · ${t('exchange.etf')}` : ''}</option>`).join('')}
        </select></label>
        <label>${t('exchange.side')}<select class="input input--select" data-sim-side>
          <option value="buy">${t('exchange.buy')}</option>
          <option value="sell">${t('exchange.sell')}</option>
          <option value="short">${t('exchange.short')}</option>
          <option value="cover">${t('exchange.cover')}</option>
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.qty')}<input class="input" type="number" min="1" step="1" value="100" data-sim-qty></label>
        <label>${t('exchange.type')}<select class="input input--select" data-sim-type>
          <option value="market">${t('exchange.market')}</option>
          <option value="limit">${t('exchange.limit')}</option>
          <option value="stop">${t('exchange.stop')}</option>
          <option value="stopLimit">${t('exchange.stopLimit')}</option>
          <option value="trailing">${t('exchange.trailing')}</option>
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.limitPrice')}<input class="input" type="number" min="0.01" step="0.01" data-sim-limit placeholder="${t('exchange.optional')}"></label>
        <label>${t('exchange.stopPrice')}<input class="input" type="number" min="0.01" step="0.01" data-sim-stop placeholder="${t('exchange.optional')}"></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.stopLimitPrice')}<input class="input" type="number" min="0.01" step="0.01" data-sim-stop-limit placeholder="${t('exchange.optional')}"></label>
        <label>${t('exchange.trailPercent')}<input class="input" type="number" min="0.1" max="49" step="0.1" data-sim-trail placeholder="2"></label>
      </div>
      <div class="exchange-ticket__row">
        <span></span>
        <button class="btn btn--primary" type="submit">${t('exchange.submit')}</button>
      </div>
      <p class="muted">${t('exchange.ticketNote')}</p>
      <p class="muted">${t('exchange.marginTicketNote')}</p>
    </form>
    <details class="exchange-oco">
        <summary>${t('exchange.ocoTitle')}</summary>
        <form data-oco-form>
          <div class="exchange-ticket__row">
            <label>${t('exchange.side')}<select class="input input--select" data-oco-action>
              <option value="closeLong">${t('exchange.sell')}</option>
              <option value="closeShort">${t('exchange.cover')}</option>
            </select></label>
            <label>${t('exchange.qty')}<input class="input" type="number" min="1" step="1" value="100" data-oco-qty></label>
          </div>
          <div class="exchange-ticket__row">
            <label>${t('exchange.ocoTakeProfit')}<input class="input" type="number" min="0.01" step="0.01" data-oco-take></label>
            <label>${t('exchange.ocoStop')}<input class="input" type="number" min="0.01" step="0.01" data-oco-stop></label>
          </div>
          <div class="exchange-ticket__row">
            <span></span>
            <button class="btn" type="submit">${t('exchange.ocoSubmit')}</button>
          </div>
        </form>
      <p class="muted">${t('exchange.ocoNote')}</p>
    </details>`;
  }

  function positionsHtml() {
    const rows = positionRows(state);
    return table({
      head: [t('exchange.ticker'), t('exchange.qty'), t('exchange.avgCost'), t('exchange.last'), t('exchange.marketValue'), t('exchange.unrealized')],
      rows: rows.map((row) => [
        row.ticker,
        numFmt(row.qty),
        moneyFmt(row.avgCost),
        moneyFmt(row.last),
        moneyFmt(row.marketValue),
        moneyFmt(row.unrealized),
      ]),
      empty: t('exchange.empty'),
    });
  }

  function shortsHtml() {
    const rows = shortRows(state);
    return table({
      head: [t('exchange.ticker'), t('exchange.qty'), t('exchange.shortAvgPrice'), t('exchange.last'), t('exchange.marketValue'), t('exchange.unrealized')],
      rows: rows.map((row) => [
        row.ticker,
        numFmt(row.qty),
        moneyFmt(row.avgPrice),
        moneyFmt(row.last),
        moneyFmt(row.marketValue),
        moneyFmt(row.unrealized),
      ]),
      empty: t('exchange.noShorts'),
    });
  }

  function marginHtml() {
    const snapshot = marginSnapshot(state);
    const margin = state.account.margin || {};
    const call = snapshot.call;
    const statusTone = snapshot.status === 'ok' ? 'pill--ok' : 'pill--warn';
    const charges = (margin.charges || []).slice(-5).reverse();
    const forced = (margin.forcedLiquidations || []).slice(-4).reverse();
    const metrics = [
      [t('exchange.longValue'), moneyFmt(snapshot.longMarketValue)],
      [t('exchange.shortValue'), moneyFmt(snapshot.shortMarketValue)],
      [t('exchange.initialMargin'), moneyFmt(snapshot.initialRequirement)],
      [t('exchange.maintenanceMargin'), moneyFmt(snapshot.maintenanceRequirement)],
      [t('exchange.marginExcess'), moneyFmt(snapshot.maintenanceExcess)],
      [t('exchange.buyingPower'), moneyFmt(snapshot.buyingPower)],
      [t('exchange.optionValue'), moneyFmt(snapshot.optionMarketValue)],
      [t('exchange.bondValue'), moneyFmt(snapshot.bondMarketValue)],
      [t('exchange.borrowedCash'), moneyFmt(snapshot.borrowedCash)],
      [t('exchange.accruedCharges'), moneyFmt(snapshot.accruedInterest + snapshot.accruedBorrowFees)],
    ];
    return `<div class="exchange-margin">
      <div class="exchange-margin__head">
        <span class="pill ${statusTone}">${t(`exchange.marginStatus.${snapshot.status}`)}</span>
        <span class="muted">${t('exchange.marginRates', {
          interest: pct(SIM_MARGIN_CONFIG.marginInterestRate * 100, i18n.locale, 2, false),
          borrow: pct(SIM_MARGIN_CONFIG.borrowFeeRate * 100, i18n.locale, 2, false),
        })}</span>
      </div>
      <div class="exchange-macro__grid">
        ${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
      </div>
      ${call ? `<p class="exchange-margin__call">${t('exchange.marginCallText', {
        deficit: moneyFmt(call.deficit),
        due: simDate(call.dueDay),
      })}</p>` : `<p class="muted">${t('exchange.marginNoCall')}</p>`}
      ${charges.length ? table({
        head: [t('exchange.time'), t('exchange.chargeType'), t('exchange.chargeAmount')],
        rows: charges.map((charge) => [
          simDate(charge.day),
          t(`exchange.charge.${charge.type}`),
          moneyFmt(charge.amount),
        ]),
      }) : ''}
      ${forced.length ? `<div class="exchange-margin__forced">
        <p class="muted">${t('exchange.forcedLiquidation')}</p>
        <ul class="aside-list exchange-events">${forced.map((item) => `<li>
          <strong>${item.ticker} · ${t(item.action === 'closeLong' ? 'exchange.sell' : 'exchange.cover')}</strong>
          <span>${t('exchange.forcedLiquidationText', {
            qty: numFmt(item.qty),
            price: moneyFmt(item.price),
          })}</span>
          <span class="muted">${simDate(item.day)} ${simClock(item.second)}</span>
        </li>`).join('')}</ul>
      </div>` : ''}
    </div>`;
  }

  function optionChainHtml() {
    const chain = buildOptionChain(state, selected, optionExpiryDays, 2);
    const rows = chain.strikes.map((strike) => {
      const call = chain.contracts.find((contract) => contract.type === 'call'
        && Math.abs(contract.strike - strike) < 1e-9);
      const put = chain.contracts.find((contract) => contract.type === 'put'
        && Math.abs(contract.strike - strike) < 1e-9);
      return [
        moneyFmt(strike),
        call ? `${moneyFmt(call.bid)} / ${moneyFmt(call.ask)}` : '—',
        put ? `${moneyFmt(put.bid)} / ${moneyFmt(put.ask)}` : '—',
      ];
    });
    const active = chain.expiries.find((expiry) => expiry.days === optionExpiryDays)
      || chain.expiries[1];
    return `${table({
      head: [t('exchange.optionStrike'), t('exchange.callBidAsk'), t('exchange.putBidAsk')],
      rows,
      empty: t('exchange.optionEmpty'),
    })}
    <p class="muted">${t('exchange.optionChainNote', {
      spot: moneyFmt(chain.spot),
      vol: pct(chain.vol * 100, i18n.locale, 1, false),
      expiry: active ? active.label : '—',
    })}</p>`;
  }

  function optionFormHtml() {
    const strikes = optionStrikeGrid(state.quotes[selected].last, 2);
    return `<form class="exchange-ticket exchange-option-form" data-option-form>
      <div class="exchange-ticket__row">
        <label>${t('exchange.optionType')}<select class="input input--select" data-option-type>
          <option value="call">${t('exchange.call')}</option>
          <option value="put">${t('exchange.put')}</option>
        </select></label>
        <label>${t('exchange.optionExpiry')}<select class="input input--select" data-option-expiry>
          ${SIM_OPTION_TENORS.map((days) => `<option value="${days}" ${days === optionExpiryDays ? 'selected' : ''}>${t('exchange.optionDays', { days })}</option>`).join('')}
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.optionStrike')}<select class="input input--select" data-option-strike>
          ${strikes.map((strike) => `<option value="${strike}">${moneyFmt(strike)}</option>`).join('')}
        </select></label>
        <label>${t('exchange.side')}<select class="input input--select" data-option-side>
          <option value="buy">${t('exchange.buy')}</option>
          <option value="sell">${t('exchange.sell')}</option>
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.optionQty')}<input class="input" type="number" min="1" step="1" value="1" data-option-qty></label>
        <button class="btn btn--primary" type="submit">${t('exchange.submit')}</button>
      </div>
      <p class="muted">${t('exchange.optionFormNote')}</p>
    </form>`;
  }

  function optionPositionsHtml() {
    const rows = optionRows(state);
    return table({
      head: [t('exchange.optionType'), t('exchange.optionStrike'), t('exchange.optionExpiry'),
        t('exchange.qty'), t('exchange.optionMark'), t('exchange.marketValue'),
        t('exchange.unrealized'), t('exchange.optionDaysLeft'), ''],
      rows: rows.map((position) => [
        `${t(`exchange.${position.type}`)} · ${position.side === 'long' ? t('exchange.optionLong') : t('exchange.optionShort')}`,
        moneyFmt(position.strike),
        position.expiryLabel,
        `${position.qty > 0 ? '+' : ''}${numFmt(position.qty)}`,
        moneyFmt(position.mark),
        moneyFmt(position.marketValue),
        moneyFmt(position.pnl),
        numFmt(position.daysLeft),
        `<span class="exchange-option-actions">
          <button class="link-btn" type="button" data-option-close="${position.key}" data-option-close-qty="${position.absQty}">${t('exchange.optionClose')}</button>
          ${position.qty > 0 && position.expiryDay === state.dayIndex
    ? `<button class="link-btn" type="button" data-option-exercise="${position.key}" data-option-exercise-qty="${position.absQty}">${t('exchange.optionExercise')}</button>` : ''}
        </span>`,
      ]),
      empty: t('exchange.optionNoPositions'),
    });
  }

  function optionSettlementsHtml() {
    const settlements = (state.account.optionSettlements || [])
      .filter((item) => item.ticker === selected);
    if (!settlements.length) return `<p class="muted">${t('exchange.optionNoSettlements')}</p>`;
    return table({
      head: [t('exchange.time'), t('exchange.ticker'), t('exchange.optionType'),
        t('exchange.optionStrike'), t('exchange.optionIntrinsic'), t('exchange.optionCash'), t('exchange.unrealized')],
      rows: settlements.slice(0, 5).map((item) => [
        simDate(item.day),
        item.ticker,
        t(`exchange.${item.type}`),
        moneyFmt(item.strike),
        moneyFmt(item.intrinsic),
        moneyFmt(item.cashDelta),
        moneyFmt(item.realized),
      ]),
    });
  }

  function optionsHtml() {
    return `<div class="exchange-options">
      <div class="exchange-options__head">
        <strong>${t('exchange.optionDealer')}</strong>
        <span class="muted">${t('exchange.optionContractSize')}</span>
      </div>
      <div id="sim-option-chain">${optionChainHtml()}</div>
      <div id="sim-option-form">${optionFormHtml()}</div>
      <div id="sim-option-positions">${optionPositionsHtml()}</div>
      <div id="sim-option-settlements">${optionSettlementsHtml()}</div>
    </div>`;
  }

  function bondQuotesHtml() {
    return table({
      head: [t('exchange.bond'), t('exchange.bondIssuer'), t('exchange.bondYears'),
        t('exchange.bondCoupon'), t('exchange.bondRating'), t('exchange.bondYield'),
        t('exchange.bid'), t('exchange.ask')],
      rows: bondQuotes(state).map((bond) => [
        bond.id,
        bond.issuer,
        numFmt(bond.years),
        pct(bond.coupon, i18n.locale, 2, false),
        bond.rating,
        pct(bond.yieldPct, i18n.locale, 2, false),
        moneyFmt(bond.bid),
        moneyFmt(bond.ask),
      ]),
      empty: t('exchange.bondEmpty'),
    });
  }

  function bondFormHtml() {
    return `<form class="exchange-ticket" data-bond-form>
      <div class="exchange-ticket__row">
        <label>${t('exchange.bond')}<select class="input input--select" data-bond-id>
          ${SIM_BONDS.map((bond) => `<option value="${bond.id}">${bond.id} · ${bond.issuer} ${bond.years}Y</option>`).join('')}
        </select></label>
        <label>${t('exchange.side')}<select class="input input--select" data-bond-side>
          <option value="buy">${t('exchange.buy')}</option>
          <option value="sell">${t('exchange.sell')}</option>
        </select></label>
      </div>
      <div class="exchange-ticket__row">
        <label>${t('exchange.qty')}<input class="input" type="number" min="1" step="1" value="10" data-bond-qty></label>
        <button class="btn btn--primary" type="submit">${t('exchange.submit')}</button>
      </div>
      <p class="muted">${t('exchange.bondFormNote')}</p>
    </form>`;
  }

  function bondPositionsHtml() {
    const rows = bondRows(state);
    return table({
      head: [t('exchange.bond'), t('exchange.qty'), t('exchange.bondAvgPrice'),
        t('exchange.bid'), t('exchange.ask'), t('exchange.marketValue'), t('exchange.unrealized')],
      rows: rows.map((position) => [
        position.id,
        numFmt(position.qty),
        moneyFmt(position.avgPrice),
        moneyFmt(position.bid),
        moneyFmt(position.ask),
        moneyFmt(position.marketValue),
        moneyFmt(position.unrealized),
      ]),
      empty: t('exchange.bondNoPositions'),
    });
  }

  function bondCouponsHtml() {
    const coupons = state.account.coupons || [];
    if (!coupons.length) return `<p class="muted">${t('exchange.bondNoCoupons')}</p>`;
    return table({
      head: [t('exchange.time'), t('exchange.bond'), t('exchange.qty'), t('exchange.bondCouponAmount')],
      rows: coupons.slice(0, 5).map((item) => [
        simDate(item.day),
        item.id,
        numFmt(item.qty),
        moneyFmt(item.amount),
      ]),
    });
  }

  function bondsHtml() {
    return `<div class="exchange-bonds">
      <div id="sim-bond-quotes">${bondQuotesHtml()}</div>
      ${bondFormHtml()}
      <div class="exchange-bonds__head">
        <strong>${t('exchange.bondPositions')}</strong>
        <span class="muted">${t('exchange.bondCouponNote')}</span>
      </div>
      <div id="sim-bond-positions">${bondPositionsHtml()}</div>
      <div class="exchange-bonds__head">
        <strong>${t('exchange.bondCoupons')}</strong>
      </div>
      <div id="sim-bond-coupons">${bondCouponsHtml()}</div>
    </div>`;
  }

  function challengeHtml() {
    const summary = exchangeChallengeSnapshot(state);
    if (!summary.active) {
      const history = summary.history.slice(0, 3);
      return `<div class="exchange-challenge">
        <p class="muted">${t('exchange.challengeIntro')}</p>
        <div class="exchange-challenge__list">
          ${summary.challenges.map((def) => `
            <div class="exchange-challenge__item">
              <div>
                <strong>${t(`exchange.challenge.${def.id}.name`)}</strong>
                <span class="muted">${t(`exchange.challenge.${def.id}.desc`)}</span>
              </div>
              <div class="exchange-challenge__meta">
                <span>${t('exchange.challengeDays', { days: def.days })}</span>
                <span>${t('exchange.challengeTarget', { value: pct(def.targetReturn * 100, i18n.locale, 0, false) })}</span>
                <span>${t('exchange.challengeDrawdown', { value: pct(def.maxDrawdown * 100, i18n.locale, 0, false) })}</span>
              </div>
              <button class="btn btn--primary btn--sm" type="button" data-challenge-start="${def.id}">${t('exchange.challengeStart')}</button>
            </div>`).join('')}
        </div>
        ${history.length ? table({
    head: [t('exchange.challengeName'), t('exchange.challengeStatus'), t('exchange.challengeReturn'), t('exchange.challengeScore'), t('exchange.challengeGrade')],
    rows: history.map((item) => [
      t(`exchange.challenge.${item.id}.name`),
      t(`exchange.challengeResult.${item.status}`),
      pctFmt(item.returnPct * 100),
      numFmt(item.score, 0),
      item.grade || '—',
    ]),
  }) : ''}
      </div>`;
    }
    const def = summary.definition;
    return `<div class="exchange-challenge">
      <div class="exchange-challenge__head">
        <div>
          <strong>${t(`exchange.challenge.${summary.id}.name`)}</strong>
          <span class="muted">${t('exchange.challengeDaysLeft', { days: summary.daysLeft })}</span>
        </div>
        <span class="pill pill--ok">${t('exchange.challengeActive')}</span>
      </div>
      <div class="exchange-macro__grid">
        <div><span>${t('exchange.equity')}</span><strong>${moneyFmt(summary.equity)}</strong></div>
        <div><span>${t('exchange.challengeReturn')}</span><strong>${pctFmt(summary.returnPct * 100)}</strong></div>
        <div><span>${t('exchange.challengeTargetLabel')}</span><strong>${pct(def.targetReturn * 100, i18n.locale, 0, false)}</strong></div>
        <div><span>${t('exchange.challengeDrawdownLabel')}</span><strong>${pct(def.maxDrawdown * 100, i18n.locale, 0, false)}</strong></div>
        <div><span>${t('exchange.challengeMaxDrawdown')}</span><strong>${pct(summary.maxDrawdown * 100, i18n.locale, 2, false)}</strong></div>
        <div><span>${t('exchange.challengeDaysLabel')}</span><strong>${numFmt(summary.daysElapsed)} / ${numFmt(def.days)}</strong></div>
        <div><span>${t('exchange.challengePositionCap')}</span><strong>${pct(def.maxPositionWeight * 100, i18n.locale, 0, false)}</strong></div>
      </div>
      <button class="btn btn--ghost btn--sm" type="button" data-challenge-abandon>${t('exchange.challengeAbandon')}</button>
    </div>`;
  }

  function timelineHtml() {
    const rows = exchangeTimelineRows(state);
    if (!rows.length) return `<p class="muted">${t('exchange.timelineEmpty')}</p>`;
    if (timelineDay === null || !rows.some((row) => row.day === timelineDay)) {
      timelineDay = rows[0].day;
    }
    return `<div class="exchange-timeline">
      <div class="exchange-ticket__row">
        <label>${t('exchange.timelineDay')}<select class="input input--select" data-timeline-day>
          ${rows.map((row) => `<option value="${row.day}" ${row.day === timelineDay ? 'selected' : ''}>${simDate(row.day)} · ${moneyFmt(row.equity)}</option>`).join('')}
        </select></label>
        <button class="btn" type="button" data-timeline-rewind>${t('exchange.timelineRewind')}</button>
      </div>
      ${table({
    head: [t('exchange.time'), t('exchange.equity'), t('exchange.challengeReturn'), t('exchange.positions')],
    rows: rows.slice(0, 8).map((row) => [
      simDate(row.day) === simDate(state.dayIndex)
        ? `${simDate(row.day)} · ${t('exchange.timelineToday')}`
        : simDate(row.day),
      moneyFmt(row.equity),
      pctFmt(row.returnPct * 100),
      numFmt(row.positionsCount),
    ]),
  })}
      <p class="muted">${t('exchange.timelineNote', { count: rows.length })}</p>
    </div>`;
  }

  function ordersHtml() {
    const rows = openOrderRows(state);
    return table({
      head: [t('exchange.order'), t('exchange.ticker'), t('exchange.side'), t('exchange.type'), t('exchange.orderStatus'), t('exchange.qty'), t('exchange.filled'), t('exchange.limitPrice'), ''],
      rows: rows.map((order) => [
        order.id,
        order.ticker,
        t(`exchange.${order.side}`),
        t(`exchange.${order.type}`),
        t(`exchange.status.${order.status}`),
        numFmt(order.qty),
        numFmt(order.filledQty),
        order.limitPrice === null ? '—' : moneyFmt(order.limitPrice),
        `<button class="link-btn" type="button" data-sim-cancel="${order.id}">${t('exchange.cancel')}</button>`,
      ]),
      empty: t('exchange.empty'),
    });
  }

  function tradesHtml() {
    const trades = state.account.trades
      .filter((trade) => !trade.asset || trade.asset === 'stock')
      .slice(-10).reverse();
    return table({
      head: [t('exchange.time'), t('exchange.order'), t('exchange.ticker'), t('exchange.side'), t('exchange.qty'), t('exchange.price'), t('exchange.fee')],
      rows: trades.map((trade) => [
        `${trade.date} ${trade.time}`,
        trade.orderId,
        trade.ticker,
        t(`exchange.${trade.side}`),
        numFmt(trade.qty),
        moneyFmt(trade.price),
        moneyFmt(trade.fee),
      ]),
      empty: t('exchange.empty'),
    });
  }

  function summaryHtml() {
    const total = equity(state);
    return `<div class="exchange-summary">
      ${statCard({ label: t('exchange.equity'), value: moneyFmt(total), tone: total >= state.account.initialCash ? 'up' : 'down' })}
      ${statCard({ label: t('exchange.cash'), value: moneyFmt(state.account.cash) })}
      ${statCard({ label: t('exchange.realized'), value: moneyFmt(state.account.realizedPnl), tone: state.account.realizedPnl >= 0 ? 'up' : 'down' })}
      ${statCard({ label: t('exchange.fees'), value: moneyFmt(state.account.fees) })}
    </div>`;
  }

  function macroHtml() {
    const macro = state.macro;
    const events = macro.events || [];
    const event = events.length ? events[events.length - 1] : null;
    const next = nextMacroEventDay(state.dayIndex);
    const warning = ['crisis', 'liquidity', 'recession', 'bear', 'highVol']
      .includes(macro.regime);
    const indicators = [
      [t('exchange.macroPolicyRate'), pctPlain(macro.policyRate, 2)],
      [t('exchange.macroInflation'), pctPlain(macro.inflation, 2)],
      [t('exchange.macroUnemployment'), pctPlain(macro.unemployment, 2)],
      [t('exchange.macroGdp'), pctPlain(macro.gdpGrowth, 2)],
      [t('exchange.macroCreditGrowth'), pctPlain(macro.creditGrowth, 2)],
      [t('exchange.macroRiskAppetite'), numFmt(macro.riskAppetite, 0)],
      [t('exchange.macroEnergyPrice'), moneyFmt(macro.energyPrice)],
      [t('exchange.macroConfidence'), numFmt(macro.consumerConfidence, 1)],
    ];
    return `<div class="exchange-macro">
      <div class="exchange-macro__head">
        <div>
          <span class="pill ${warning ? 'pill--warn' : 'pill--ok'}">${t(`exchange.macro.regime.${macro.regime}`)}</span>
          ${macro.bubbleSector ? `<span class="pill pill--warn">${t('exchange.macroBubble', {
            sector: sectorLabel(ctx, macro.bubbleSector),
          })}</span>` : ''}
        </div>
        <span class="muted">${t('exchange.macroNextEvent', { date: simDate(next) })}</span>
      </div>
      <div class="exchange-macro__grid">
        ${indicators.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
      </div>
      ${event ? `<div class="exchange-macro__event">
        <div class="exchange-macro__eventhead">
          <strong>${t(`exchange.macroEvent.${event.type}.label`)}</strong>
          <span class="muted">${simDate(event.day)}</span>
        </div>
        <div class="exchange-macro__grid">
          <div><span>${t('exchange.macroActual')}</span><strong>${macroValue(event.type, event.actual)}</strong></div>
          <div><span>${t('exchange.macroForecast')}</span><strong>${macroValue(event.type, event.forecast)}</strong></div>
          <div><span>${t('exchange.macroSurprise')}</span><strong class="${event.marketTone === 'positive' ? 'up' : event.marketTone === 'negative' ? 'down' : 'flat'}">${macroValue(event.type, event.difference, true)}</strong></div>
        </div>
        <p class="muted">${t(`exchange.macroEvent.${event.type}.summary`, {
          actual: macroValue(event.type, event.actual),
          forecast: macroValue(event.type, event.forecast),
        })}</p>
      </div>` : `<p class="muted">${t('exchange.macroNoEvent')}</p>`}
    </div>`;
  }

  function rightsHtml() {
    const offer = openRightsOfferings(state).find((item) => item.ticker === selected);
    if (!offer) return `<p class="muted">${t('exchange.noRights')}</p>`;
    const cost = offer.entitled * offer.price;
    const affordable = cost <= availableCash(state);
    const canSubscribe = offer.entitled > 0 && affordable;
    return `<div class="exchange-rights">
      <p class="muted">${t('exchange.rightsTerms', {
        ratio: pct(offer.ratio * 100, i18n.locale, 1, false),
        price: moneyFmt(offer.price),
        deadline: simDate(offer.deadline),
      })}</p>
      <div class="exchange-macro__grid">
        <div><span>${t('exchange.rightsEntitled')}</span><strong>${numFmt(offer.entitled)}</strong></div>
        <div><span>${t('exchange.rightsCost')}</span><strong>${moneyFmt(cost)}</strong></div>
      </div>
      ${offer.entitled <= 0 ? `<p class="muted">${t('exchange.rightsNone')}</p>` : ''}
      ${offer.entitled > 0 && !affordable ? `<p class="muted">${t('exchange.rightsInsufficientCash')}</p>` : ''}
      <div class="exchange-rights__actions">
        <button class="btn btn--primary" type="button" data-rights-subscribe ${canSubscribe ? '' : 'disabled'}>${t('exchange.rightsSubscribe')}</button>
        <button class="btn" type="button" data-rights-decline>${t('exchange.rightsDecline')}</button>
      </div>
    </div>`;
  }

  function etfProfileHtml(cs) {
    const etf = cs.company;
    const quote = state.quotes[selected];
    const nav = etfNav(state, etf);
    const premium = nav ? (quote.last / nav - 1) * 100 : 0;
    const shares = etf.sharesOutstanding || 0;
    const holdings = etfHoldingsRows(state, etf);
    const metrics = [
      [t('exchange.etfNav'), moneyFmt(nav)],
      [t('exchange.etfPremium'), pct(premium, i18n.locale, 2)],
      [t('exchange.etfExpenseRatio'), pct(etf.expenseRatio, i18n.locale, 2, false)],
      [t('exchange.last'), moneyFmt(quote.last)],
      [t('exchange.marketCap'), moneyCompact(quote.last * shares, i18n.locale)],
      [t('exchange.sharesOutstanding'), compactNumber(shares, i18n.locale)],
      [t('exchange.etfHoldings'), numFmt(holdings.length)],
      [t('exchange.sector'), t('exchange.etfSector')],
    ];
    return ` <div class="exchange-company">
      <div class="exchange-company__head">
        <div><strong>${etf.name}</strong><span class="muted">${selected} · ${t('exchange.etf')}</span></div>
        <span class="pill pill--ok">${t('exchange.etf')}</span>
      </div>
      <p class="muted exchange-company__desc">${etf.description}</p>
      <div class="exchange-company__meta">
        ${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
      </div>
      ${table({
        head: [t('exchange.etfHolding'), t('exchange.etfHoldingWeight'), t('exchange.last'), t('exchange.change'), t('exchange.etfContribution')],
        rows: holdings.map((holding) => [
          `${holding.ticker} · ${holding.name}`,
          pct(holding.weight * 100, i18n.locale, 2, false),
          moneyFmt(holding.last),
          pctFmt(holding.changePct),
          `${holding.contribution > 0 ? '+' : ''}${pct(holding.contribution, i18n.locale, 2, false)}`,
        ]),
        empty: t('exchange.noEtfHoldings'),
      })}
    </div>`;
  }

  function companyActionsHtml() {
    if (state.companies[selected]?.isEtf) return '';
    return `<button class="btn btn--ghost btn--sm" type="button" data-statement-link>${t('exchange.viewStatements')}</button>`;
  }

  function companyProfileHtml() {
    const cs = state.companies[selected];
    if (cs.isEtf) return etfProfileHtml(cs);
    const company = cs.company;
    const quote = state.quotes[selected];
    const report = latestReport(state, selected);
    const history = reportHistory(state, selected, 4);
    const annualDividend = dividendPerShare(state, selected);
    const yieldPct = quote.last ? annualDividend / quote.last * 100 : 0;
    const reportEpsCurrent = report
      ? report.income.eps * report.splitFactor / cs.splitFactor
      : null;
    const pe = reportEpsCurrent > 0 ? quote.last / (reportEpsCurrent * 4) : null;
    const sensitivity = sectorSensitivity(company.sector);
    const sharesCurrent = company.sharesOutstanding * cs.splitFactor * cs.capitalFactor;
    const marketCap = quote.last * sharesCurrent;
    const metrics = [
      [t('exchange.sector'), sectorLabel(ctx, company.sector)],
      [t('exchange.stageLabel'), t(`exchange.stage.${company.stage}`)],
      [t('exchange.riskLabel'), t(`exchange.risk.${company.risk}`)],
      [t('exchange.marketCap'), moneyCompact(marketCap, i18n.locale)],
      [t('exchange.sharesOutstanding'), compactNumber(sharesCurrent, i18n.locale)],
      [t('exchange.pe'), pe === null ? '—' : numFmt(pe, 1)],
      [t('exchange.dividendYield'), pct(yieldPct, i18n.locale, 2, false)],
      [t('exchange.macroSensitivity'),
        `${signedNum(sensitivity.growth)} / ${signedNum(sensitivity.rates)} / ${signedNum(sensitivity.energy)}`],
    ];
    const reportMetrics = report ? [
      [t('exchange.reportRevenue'), moneyCompact(report.income.revenue, i18n.locale)],
      [t('exchange.reportNetIncome'), moneyCompact(report.income.netIncome, i18n.locale)],
      [t('exchange.reportEps'), moneyFmt(report.income.eps)],
      [t('exchange.reportGrossMargin'), pct(report.ratios.grossMargin * 100, i18n.locale, 1, false)],
      [t('exchange.reportOperatingMargin'), pct(report.ratios.operatingMargin * 100, i18n.locale, 1, false)],
      [t('exchange.reportNetMargin'), pct(report.ratios.netMargin * 100, i18n.locale, 1, false)],
      [t('exchange.reportOperatingCashFlow'), moneyCompact(report.cashFlow.operatingCashFlow, i18n.locale)],
      [t('exchange.reportAssets'), moneyCompact(report.balance.totalAssets, i18n.locale)],
      [t('exchange.reportLiabilities'), moneyCompact(report.balance.totalLiabilities, i18n.locale)],
      [t('exchange.reportEquity'), moneyCompact(report.balance.equity, i18n.locale)],
      [t('exchange.reportCash'), moneyCompact(report.balance.cash, i18n.locale)],
      [t('exchange.reportDividendPerShare'), moneyFmt(report.ratios.annualDividendPerShare)],
    ] : [];
    const historyRows = history.map((item) => [
      `${item.periodLabel}${item.splitFactor > 1 ? ` · ×${numFmt(item.splitFactor)}` : ''}`,
      moneyCompact(item.income.revenue, i18n.locale),
      moneyCompact(item.income.netIncome, i18n.locale),
      moneyFmt(item.income.eps),
      pct(item.ratios.netMargin * 100, i18n.locale, 1, false),
      moneyCompact(item.cashFlow.operatingCashFlow, i18n.locale),
    ]);
    return `
      <div class="exchange-company">
        <div class="exchange-company__head">
          <div><strong>${company.name}</strong><span class="muted">${selected} · ${sectorLabel(ctx, company.sector)}</span></div>
          <span class="pill">${t(`exchange.stage.${company.stage}`)}</span>
        </div>
        <p class="muted exchange-company__desc">${company.description}</p>
        <div class="exchange-company__meta">
          ${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
        </div>
        ${report ? `
          <div class="exchange-report">
            <div class="exchange-report__head">
              <div><strong>${report.periodLabel}</strong><span class="muted">${t('exchange.reportedOn', { date: report.reportDate })}</span></div>
              ${report.splitFactor > 1 ? `<span class="pill">${t('exchange.splitAdjusted', { factor: numFmt(report.splitFactor) })}</span>` : ''}
            </div>
            <div class="exchange-report__grid">
              ${reportMetrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}
            </div>
            ${historyRows.length ? table({
              head: [
                t('exchange.reportPeriod'), t('exchange.reportRevenue'), t('exchange.reportNetIncome'),
                t('exchange.reportEps'), t('exchange.reportNetMargin'), t('exchange.reportOperatingCashFlow'),
              ],
              rows: historyRows,
            }) : ''}
          </div>` : `<p class="muted">${t('exchange.noReport')}</p>`}
      </div>`;
  }

  function dividendsHtml() {
    const rows = state.account.dividends.slice(-10).reverse();
    const total = state.account.dividends.reduce((sum, item) => sum + item.amount, 0);
    return `${rows.length ? `<p class="muted">${t('exchange.dividendsTotal', { amount: moneyFmt(total) })}</p>` : ''}
      ${table({
        head: [t('exchange.time'), t('exchange.ticker'), t('exchange.qty'), t('exchange.dividendPerShare'), t('exchange.dividendAmount')],
        rows: rows.map((item) => [
          simDate(item.day),
          item.ticker,
          numFmt(item.qty),
          moneyFmt(item.dps),
          moneyFmt(item.amount),
        ]),
        empty: t('exchange.noDividends'),
      })}`;
  }

  function eventsHtml() {
    const reports = state.reports
      .filter((item) => item.ticker === selected)
      .map((item) => ({ ...item, kind: 'earnings' }));
    const splits = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'split')
      .map((item) => ({ ...item, kind: 'split' }));
    const guidance = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'guidance')
      .map((item) => ({ ...item, kind: 'guidance' }));
    const capital = state.corporateActions
      .filter((item) => item.ticker === selected && ['buyback', 'offering'].includes(item.type))
      .map((item) => ({ ...item, kind: item.type }));
    const structural = state.corporateActions
      .filter((item) => item.ticker === selected && ['merger', 'spinoff'].includes(item.type))
      .map((item) => ({ ...item, kind: item.type }));
    const halts = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'halt')
      .map((item) => ({ ...item, kind: 'halt' }));
    const rights = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'rights')
      .map((item) => ({ ...item, kind: 'rights' }));
    const bankruptcies = state.corporateActions
      .filter((item) => item.ticker === selected && item.type === 'bankruptcy')
      .map((item) => ({ ...item, kind: 'bankruptcy' }));
    const dividends = state.account.dividends
      .filter((item) => item.ticker === selected)
      .map((item) => ({ ...item, kind: 'dividend' }));
    const events = [...reports, ...splits, ...guidance, ...capital, ...structural,
      ...halts, ...rights, ...bankruptcies, ...dividends]
      .sort((a, b) => b.day - a.day)
      .slice(0, 8);
    if (!events.length) return `<p class="muted">${t('exchange.noEvents')}</p>`;
    return `<ul class="aside-list exchange-events">${events.map((event) => {
      if (event.kind === 'earnings') {
        return `<li><strong>${t('exchange.eventEarnings')}</strong><span>${event.periodLabel} · ${t('exchange.eventEps', {
          eps: moneyFmt(event.eps),
          expected: moneyFmt(event.expectedEps),
          surprise: pct(event.surprise * 100, i18n.locale, 1),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'guidance') {
        return `<li><strong>${t('exchange.eventGuidance')}</strong><span>${t('exchange.eventGuidanceText', {
          quarter: quarterLabel(event.quarter),
          eps: moneyFmt(event.eps),
          baseline: moneyFmt(event.baseline),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'buyback' || event.kind === 'offering') {
        const buyback = event.kind === 'buyback';
        return `<li><strong>${t(buyback ? 'exchange.eventBuyback' : 'exchange.eventOffering')}</strong><span>${t(buyback ? 'exchange.eventBuybackText' : 'exchange.eventOfferingText', {
          ratio: pct(event.ratio * 100, i18n.locale, 1, false),
          cash: moneyFmt(Math.abs(event.cashDelta)),
          shares: compactNumber(Math.abs(event.sharesDelta), i18n.locale),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'merger') {
        return `<li><strong>${t('exchange.eventMerger')}</strong><span>${t('exchange.eventMergerText', {
          price: moneyCompact(event.purchasePrice, i18n.locale),
          share: pct(event.revenueShare * 100, i18n.locale, 1, false),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'spinoff') {
        return `<li><strong>${t('exchange.eventSpinoff')}</strong><span>${t('exchange.eventSpinoffText', {
          share: pct(event.assetShare * 100, i18n.locale, 1, false),
          dps: moneyFmt(event.distributionPerShare),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'halt') {
        return `<li><strong>${t('exchange.eventHalt')}</strong><span>${t('exchange.eventHaltText', {
          date: simDate(event.until),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'rights') {
        return `<li><strong>${t('exchange.eventRights')}</strong><span>${t('exchange.eventRightsText', {
          ratio: pct(event.ratio * 100, i18n.locale, 1, false),
          price: moneyFmt(event.price),
          deadline: simDate(event.deadline),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'bankruptcy') {
        return `<li><strong>${t('exchange.eventBankruptcy')}</strong><span>${t('exchange.eventBankruptcyText', {
          qty: numFmt(event.qty),
          loss: moneyFmt(event.loss),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      if (event.kind === 'split') {
        if (event.reverse) {
          return `<li><strong>${t('exchange.eventReverseSplit')}</strong><span>${t('exchange.eventReverseSplitText', {
            ratio: `1:${numFmt(1 / event.ratio)}`,
            cash: moneyFmt(event.cashInLieu || 0),
          })}</span><span class="muted">${simDate(event.day)}</span></li>`;
        }
        return `<li><strong>${t('exchange.eventSplit')}</strong><span>${t('exchange.eventSplitText', {
          ratio: numFmt(event.ratio),
        })}</span><span class="muted">${simDate(event.day)}</span></li>`;
      }
      return `<li><strong>${t('exchange.eventDividend')}</strong><span>${t('exchange.eventDividendText', {
        qty: numFmt(event.qty),
        amount: moneyFmt(event.amount),
      })}</span><span class="muted">${simDate(event.day)}</span></li>`;
    }).join('')}</ul>`;
  }

  function newsHtml() {
    const events = state.news.slice(-8).reverse();
    if (!events.length) return `<p class="muted">${t('exchange.noNews')}</p>`;
    return `<ul class="aside-list exchange-news">${events.map((event) => {
      const params = event.scope === 'sector'
        ? { ...event.params, sector: sectorLabel(ctx, event.sector) }
        : event.params;
      const scopeLabel = event.scope === 'company'
        ? event.ticker
        : event.scope === 'sector' ? sectorLabel(ctx, event.sector) : t('exchange.marketWide');
      return `<li>
        <div class="exchange-news__head"><strong>${t(`exchange.news.${event.template}.headline`, params)}</strong>
          <span class="pill ${event.impact > 0 ? 'pill--ok' : 'pill--warn'}">${pct(event.impact * 100, i18n.locale, 1)}</span></div>
        <span>${t(`exchange.news.${event.template}.summary`, params)}</span>
        <span class="muted">${scopeLabel} · ${simDate(event.day)}</span>
      </li>`;
    }).join('')}</ul>`;
  }

  function pageHtml() {
    return `
      <div class="exchange-page">
        ${pageHead({
          eyebrow: t('exchange.eyebrow'),
          title: t('exchange.title'),
          subtitle: t('exchange.subtitle'),
          actions: `<span class="pill pill--warn">${t('exchange.simBadge')}</span>`,
        })}
        ${card({
          title: t('exchange.clockTitle'),
          subtitle: t('exchange.clockSubtitle'),
          body: `${clockHtml()}${controlsHtml()}`,
        })}
        <div class="exchange-layout">
          <div class="exchange-main">
            ${card({
              id: 'sim-chart-card',
              title: `${selected} · ${t(`exchange.tf.${timeframe}`)}`,
              subtitle: t('exchange.chartSubtitle'),
              actions: segmented({
                options: TIMEFRAMES.map((value) => ({ value, label: t(`exchange.tf.${value}`) })),
                active: timeframe,
                attr: 'sim-tf',
              }),
              body: `${quoteHtml()}<div class="exchange-chart"><canvas id="sim-chart"></canvas></div><p class="muted" id="sim-chart-note">${chartNote()}</p>`,
            })}
            ${card({
              id: 'sim-company-card',
              title: t('exchange.companyProfile'),
              subtitle: t('exchange.companyProfileSubtitle'),
              actions: `<span id="sim-company-actions">${companyActionsHtml()}</span>`,
              body: `<div id="sim-company">${companyProfileHtml()}</div>`,
            })}
            ${card({ title: t('exchange.positions'), body: `<div id="sim-positions">${positionsHtml()}</div>` })}
            ${card({
              title: t('exchange.marginTitle'),
              subtitle: t('exchange.marginSubtitle'),
              body: `<div id="sim-shorts">${shortsHtml()}</div><div id="sim-margin">${marginHtml()}</div>`,
            })}
            ${card({
              title: t('exchange.challengeTitle'),
              subtitle: t('exchange.challengeSubtitle'),
              body: `<div id="sim-challenge">${challengeHtml()}</div>`,
            })}
            ${card({
              title: t('exchange.timelineTitle'),
              subtitle: t('exchange.timelineSubtitle'),
              body: `<div id="sim-timeline">${timelineHtml()}</div>`,
            })}
            ${card({
              title: t('exchange.optionTitle'),
              subtitle: t('exchange.optionSubtitle'),
              body: `<div id="sim-options">${optionsHtml()}</div>`,
            })}
            ${card({
              title: t('exchange.bondTitle'),
              subtitle: t('exchange.bondSubtitle'),
              body: `<div id="sim-bonds">${bondsHtml()}</div>`,
            })}
            ${card({ title: t('exchange.orders'), body: `<div id="sim-orders">${ordersHtml()}</div>` })}
            ${card({ title: t('exchange.trades'), body: `<div id="sim-trades">${tradesHtml()}</div>` })}
            ${card({ title: t('exchange.dividends'), body: `<div id="sim-dividends">${dividendsHtml()}</div>` })}
          </div>
          <div class="exchange-side">
            ${card({ title: t('exchange.book'), subtitle: t('exchange.bookSubtitle'), body: `<div id="sim-book">${bookHtml()}</div>` })}
            ${card({ title: t('exchange.macroTitle'), subtitle: t('exchange.macroSubtitle'), body: `<div id="sim-macro">${macroHtml()}</div>` })}
            ${card({ title: t('exchange.newsTitle'), subtitle: t('exchange.newsSubtitle'), body: `<div id="sim-news">${newsHtml()}</div>` })}
            ${card({ title: t('exchange.events'), subtitle: t('exchange.eventsSubtitle'), body: `<div id="sim-events">${eventsHtml()}</div>` })}
            ${card({ title: t('exchange.rightsTitle'), subtitle: t('exchange.rightsSubtitle'), body: `<div id="sim-rights">${rightsHtml()}</div>` })}
            ${card({ title: t('exchange.ticket'), subtitle: t('exchange.ticketSubtitle'), body: ticketHtml() })}
            <div id="sim-summary">${summaryHtml()}</div>
            <p class="muted">${t('exchange.phaseNote')}</p>
          </div>
        </div>
      </div>`;
  }

  function ensureOptionForm() {
    const key = `${selected}:${state.dayIndex}`;
    if (key === optionFormKey) return;
    optionFormKey = key;
    const node = container.querySelector('#sim-option-form');
    if (node) node.innerHTML = optionFormHtml();
  }

  function refreshDynamic() {
    if (destroyed) return;
    const set = (selector, html) => {
      const node = container.querySelector(selector);
      if (node) node.innerHTML = html;
    };
    set('#sim-clock', `${simClock(state.second)}`);
    set('#sim-date', simDate(state.dayIndex));
    set('#sim-book', bookHtml());
    set('#sim-positions', positionsHtml());
    set('#sim-shorts', shortsHtml());
    set('#sim-margin', marginHtml());
    set('#sim-challenge', challengeHtml());
    set('#sim-timeline', timelineHtml());
    set('#sim-orders', ordersHtml());
    set('#sim-trades', tradesHtml());
    set('#sim-company', companyProfileHtml());
    set('#sim-company-actions', companyActionsHtml());
    set('#sim-option-chain', optionChainHtml());
    set('#sim-option-positions', optionPositionsHtml());
    set('#sim-option-settlements', optionSettlementsHtml());
    set('#sim-bond-quotes', bondQuotesHtml());
    set('#sim-bond-positions', bondPositionsHtml());
    set('#sim-bond-coupons', bondCouponsHtml());
    ensureOptionForm();
    set('#sim-dividends', dividendsHtml());
    set('#sim-macro', macroHtml());
    set('#sim-news', newsHtml());
    set('#sim-events', eventsHtml());
    set('#sim-rights', rightsHtml());
    set('#sim-summary', summaryHtml());
    const note = container.querySelector('#sim-chart-note');
    if (note) note.textContent = chartNote();
    const quoteNode = container.querySelector('.exchange-quote');
    if (quoteNode) quoteNode.outerHTML = quoteHtml();
    const chartTitle = container.querySelector('#sim-chart-card .card__title');
    if (chartTitle) chartTitle.textContent = `${selected} · ${t(`exchange.tf.${timeframe}`)}`;
    if (chart) chart.setData(chartData());
  }

  function paint(force = false) {
    const now = Date.now();
    if (!force && now - lastPaint < 120) return;
    lastPaint = now;
    refreshDynamic();
  }

  function onSecond() {
    state = advanceSecond(state);
    paint();
  }

  function onMinute() {
    paint(true);
  }

  function setSelected(next) {
    if (!state.companies[next]) return;
    selected = next;
    paint(true);
  }

  function submit(event) {
    event.preventDefault();
    if (clock && clock.running) {
      toastFn(t('exchange.pauseFirst'), 'warn');
      return;
    }
    const form = event.target;
    const side = form.querySelector('[data-sim-side]').value;
    const type = form.querySelector('[data-sim-type]').value;
    const qty = Number(form.querySelector('[data-sim-qty]').value);
    const limitValue = form.querySelector('[data-sim-limit]').value;
    const stopValue = form.querySelector('[data-sim-stop]').value;
    const stopLimitValue = form.querySelector('[data-sim-stop-limit]').value;
    const trailValue = form.querySelector('[data-sim-trail]').value;
    const conditional = ['stop', 'stopLimit', 'trailing'].includes(type);
    const result = submitOrder(state, {
      ticker: selected,
      side,
      type,
      qty,
      limitPrice: type === 'limit' ? Number(limitValue) : null,
      stopPrice: (type === 'stop' || type === 'stopLimit') ? Number(stopValue) : null,
      stopLimitPrice: type === 'stopLimit' ? Number(stopLimitValue) : null,
      trailPct: type === 'trailing' ? Number(trailValue) / 100 : null,
      pending: true,
    });
    if (!result.ok) {
      toastFn(t(`exchange.error.${result.error}`), 'error');
      return;
    }
    if (conditional) {
      toastFn(t('exchange.conditionalSubmitted', {
        qty: result.order.qty,
        type: t(`exchange.${type}`),
      }), 'info');
      paint(true);
      return;
    }
    if (result.order.status === 'pending') {
      toastFn(t('exchange.submittedPending', { qty: result.order.qty }), 'info');
      paint(true);
      return;
    }
    toastFn(t('exchange.submitted', {
      status: t(`exchange.status.${result.order.status}`),
      filled: result.order.filledQty,
      qty: result.order.qty,
    }), result.order.filledQty ? 'success' : 'info');
    paint(true);
  }

  function submitOption(event) {
    event.preventDefault();
    if (clock && clock.running) {
      toastFn(t('exchange.pauseFirst'), 'warn');
      return;
    }
    const form = event.target;
    const type = form.querySelector('[data-option-type]').value;
    const expiryDays = Number(form.querySelector('[data-option-expiry]').value);
    const strike = Number(form.querySelector('[data-option-strike]').value);
    const side = form.querySelector('[data-option-side]').value;
    const qty = Number(form.querySelector('[data-option-qty]').value);
    optionExpiryDays = expiryDays;
    const result = submitOptionOrder(state, {
      ticker: selected,
      type,
      strike,
      expiryDay: state.dayIndex + expiryDays,
      qty,
      side,
    });
    if (!result.ok) {
      toastFn(t(`exchange.error.${result.error}`), 'error');
      return;
    }
    toastFn(t(side === 'buy' ? 'exchange.optionOpened' : 'exchange.optionSold', {
      qty: numFmt(result.qty),
      strike: moneyFmt(result.contract.strike),
      type: t(`exchange.${type}`),
    }), 'success');
    paint(true);
  }

  function submitBond(event) {
    event.preventDefault();
    if (clock && clock.running) {
      toastFn(t('exchange.pauseFirst'), 'warn');
      return;
    }
    const form = event.target;
    const id = form.querySelector('[data-bond-id]').value;
    const side = form.querySelector('[data-bond-side]').value;
    const qty = Number(form.querySelector('[data-bond-qty]').value);
    const result = submitBondOrder(state, { id, side, qty });
    if (!result.ok) {
      toastFn(t(`exchange.error.${result.error}`), 'error');
      return;
    }
    toastFn(t(side === 'buy' ? 'exchange.bondBought' : 'exchange.bondSold', {
      qty: numFmt(result.qty),
      id,
    }), 'success');
    paint(true);
  }

  function submitOcoForm(event) {
    event.preventDefault();
    if (clock && clock.running) {
      toastFn(t('exchange.pauseFirst'), 'warn');
      return;
    }
    const form = event.target;
    const action = form.querySelector('[data-oco-action]').value;
    const qty = Number(form.querySelector('[data-oco-qty]').value);
    const takeProfitPrice = Number(form.querySelector('[data-oco-take]').value);
    const stopPrice = Number(form.querySelector('[data-oco-stop]').value);
    const result = submitOco(state, {
      ticker: selected,
      action,
      qty,
      takeProfitPrice,
      stopPrice,
    });
    if (!result.ok) {
      toastFn(t(`exchange.error.${result.error}`), 'error');
      return;
    }
    toastFn(t('exchange.ocoSubmitted', { qty: numFmt(qty) }), 'success');
    paint(true);
  }

  function syncOrderTypeFields() {
    const type = container.querySelector('[data-sim-type]')?.value;
    const setDisabled = (selector, disabled) => {
      const node = container.querySelector(selector);
      if (node) node.disabled = disabled;
    };
    setDisabled('[data-sim-limit]', type !== 'limit');
    setDisabled('[data-sim-stop]', type !== 'stop' && type !== 'stopLimit');
    setDisabled('[data-sim-stop-limit]', type !== 'stopLimit');
    setDisabled('[data-sim-trail]', type !== 'trailing');
  }

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, serializeExchange(state));
      return true;
    } catch (error) {
      console.warn('[exchange] save failed', error);
      return false;
    }
  }

  function save() {
    if (persist()) toastFn(t('exchange.saved'), 'success');
    else toastFn(t('exchange.saveFailed'), 'error');
  }

  function reset() {
    if (typeof window !== 'undefined' && window.confirm(t('exchange.resetConfirm'))) {
      state = createExchangeEngine({ seed: 'sim-exchange-v1' });
      selected = 'NCRT';
      timeframe = '5m';
      optionExpiryDays = 30;
      optionFormKey = '';
      timelineDay = null;
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (error) {
        console.warn('[exchange] reset save failed', error);
      }
      if (clock) {
        clock.pause();
        clock.secondCounter = 0;
      }
      mountPage();
      toastFn(t('exchange.resetDone'), 'success');
    }
  }

  function bind() {
    container.addEventListener('click', (event) => {
      const target = event.target.closest('[data-sim-play],[data-sim-speed],[data-sim-step],[data-sim-step-day],[data-sim-save],[data-sim-reset],[data-sim-tf],[data-sim-cancel],[data-statement-link],[data-rights-subscribe],[data-rights-decline],[data-option-close],[data-option-exercise],[data-challenge-start],[data-challenge-abandon],[data-timeline-rewind]');
      if (!target) return;
      if (target.matches('[data-challenge-start]')) {
        const result = startExchangeChallenge(state, target.dataset.challengeStart);
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        toastFn(t('exchange.challengeStarted', {
          name: t(`exchange.challenge.${result.definition.id}.name`),
        }), 'success');
        paint(true);
        return;
      }
      if (target.matches('[data-challenge-abandon]')) {
        if (typeof window !== 'undefined'
          && !window.confirm(t('exchange.challengeAbandonConfirm'))) return;
        const result = abandonExchangeChallenge(state);
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        toastFn(t('exchange.challengeAbandoned'), 'info');
        paint(true);
        return;
      }
      if (target.matches('[data-timeline-rewind]')) {
        const rows = exchangeTimelineRows(state);
        const day = timelineDay ?? rows[0]?.day;
        if (day === null || day === undefined) return;
        if (typeof window !== 'undefined'
          && !window.confirm(t('exchange.timelineConfirm', { date: simDate(day) }))) return;
        const result = rewindToDay(state, day);
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        if (clock) {
          clock.pause();
          clock.secondCounter = state.second;
        }
        timelineDay = null;
        toastFn(t('exchange.timelineRewound', { date: simDate(day) }), 'success');
        paint(true);
        return;
      }
      if (target.matches('[data-option-exercise]')) {
        const result = exerciseOptionPosition(
          state, target.dataset.optionExercise, Number(target.dataset.optionExerciseQty),
        );
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        toastFn(t('exchange.optionExercised', {
          qty: numFmt(result.qty),
          shares: numFmt(result.shares),
        }), 'success');
        paint(true);
        return;
      }
      if (target.matches('[data-option-close]')) {
        const result = closeOptionPosition(
          state, target.dataset.optionClose, Number(target.dataset.optionCloseQty),
        );
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        toastFn(t('exchange.optionClosed', { qty: numFmt(result.qty) }), 'success');
        paint(true);
        return;
      }
      if (target.matches('[data-rights-subscribe]')) {
        const offer = openRightsOfferings(state).find((item) => item.ticker === selected);
        if (!offer) return;
        const result = subscribeRights(state, offer.id);
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        toastFn(t('exchange.rightsSubscribed', { qty: numFmt(result.qty) }), 'success');
        paint(true);
        return;
      }
      if (target.matches('[data-rights-decline]')) {
        const offer = openRightsOfferings(state).find((item) => item.ticker === selected);
        if (!offer) return;
        const result = declineRights(state, offer.id);
        if (!result.ok) {
          toastFn(t(`exchange.error.${result.error}`), 'error');
          return;
        }
        toastFn(t('exchange.rightsDeclined'), 'info');
        paint(true);
        return;
      }
      if (target.matches('[data-sim-step-day]')) {
        if (clock.running) clock.pause();
        advanceDay(state);
        clock.secondCounter = state.second;
        paint(true);
        return;
      }
      if (target.matches('[data-statement-link]')) {
        if (!persist()) { toastFn(t('exchange.saveFailed'), 'error'); return; }
        if (router) router.go(`/exchange/statements/${selected}`);
        return;
      }
      if (target.matches('[data-sim-play]')) {
        clock.toggle();
        target.textContent = clock.running ? t('exchange.pause') : t('exchange.play');
        const dot = container.querySelector('.exchange-clock .status-dot');
        if (dot) dot.classList.toggle('is-live', clock.running);
        return;
      }
      if (target.matches('[data-sim-speed]')) {
        clock.setSpeed(Number(target.dataset.simSpeed));
        container.querySelectorAll('[data-sim-speed]').forEach((button) => {
          button.classList.toggle('is-active', button === target);
        });
        return;
      }
      if (target.matches('[data-sim-step]')) {
        if (clock.running) clock.pause();
        const count = Number(target.dataset.simStep);
        if (count >= 60) clock.stepMinute();
        else clock.step();
        paint(true);
        return;
      }
      if (target.matches('[data-sim-save]')) { save(); return; }
      if (target.matches('[data-sim-reset]')) { reset(); return; }
      if (target.matches('[data-sim-tf]')) {
        timeframe = target.dataset.simTf;
        container.querySelectorAll('[data-sim-tf]').forEach((button) => {
          button.classList.toggle('is-active', button === target);
        });
        paint(true);
        return;
      }
      if (target.matches('[data-sim-cancel]')) {
        const result = cancelOrder(state, target.dataset.simCancel);
        if (!result.ok) toastFn(t(`exchange.error.${result.error}`), 'error');
        paint(true);
      }
    });
    container.addEventListener('change', (event) => {
      if (event.target.matches('[data-sim-ticker]')) {
        setSelected(event.target.value);
      }
      if (event.target.matches('[data-sim-type]')) syncOrderTypeFields();
      if (event.target.matches('[data-option-expiry]')) {
        optionExpiryDays = Number(event.target.value);
        paint(true);
      }
      if (event.target.matches('[data-timeline-day]')) {
        timelineDay = Number(event.target.value);
      }
    });
    container.addEventListener('submit', (event) => {
      if (event.target.matches('[data-sim-form]')) submit(event);
      if (event.target.matches('[data-option-form]')) submitOption(event);
      if (event.target.matches('[data-bond-form]')) submitBond(event);
      if (event.target.matches('[data-oco-form]')) submitOcoForm(event);
    });
  }

  function mountPage() {
    if (chart) chart.destroy();
    chart = null;
    optionFormKey = '';
    container.innerHTML = pageHtml();
    const canvas = container.querySelector('#sim-chart');
    if (canvas) {
      chart = new CandlestickChart(canvas, {
        showVolume: true,
        yFormat: (value) => money(value, i18n.locale),
      });
      chart.setData(chartData());
    }
    syncOrderTypeFields();
  }

  function mount(root) {
    if (clock) clock.destroy();
    if (chart) chart.destroy();
    container = root;
    destroyed = false;
    clock = new SimulationClock({
      onSecond,
      onMinute,
      speed: 5,
    });
    clock.pause();
    clock.secondCounter = state.second;
    mountPage();
    bind();
    const play = container.querySelector('[data-sim-play]');
    if (play) play.textContent = t('exchange.play');
  }

  function render() {
    if (container && !destroyed) paint(true);
  }

  function destroy() {
    destroyed = true;
    if (clock) clock.destroy();
    if (chart) chart.destroy();
    clock = null;
    chart = null;
  }

  return { mount, render, destroy };
}
