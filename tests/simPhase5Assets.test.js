import { test, assert, assertEqual, assertClose } from './harness.js';
import {
  createExchangeEngine, advanceSecond, submitOrder, submitOptionOrder,
  closeOptionPosition, submitBondOrder, serializeExchange, deserializeExchange,
  equity, checkMargin, latestReport, dividendPerShare,
} from '../js/sim/exchangeEngine.js';
import { etfNav } from '../js/sim/etfs.js';
import {
  buildOptionChain, optionRows, optionCollateral,
} from '../js/sim/options.js';
import { marginSnapshot } from '../js/sim/margin.js';
import {
  SIM_BONDS, SIM_BOND_BY_ID, bondQuote, bondRows, SIM_BOND_COUPON_DAYS,
} from '../js/sim/bonds.js';

function setMarket(state, ticker, price) {
  const cs = state.companies[ticker];
  if (!cs) return;
  cs.last = price;
  cs.fairValue = price;
  cs.open = price;
  cs.high = price;
  cs.low = price;
  cs.ema = price;
  cs.book.setMarketMaker({ bid: price - 0.4, ask: price + 0.4, size: 200_000 });
  state.quotes[ticker] = {
    ...state.quotes[ticker],
    last: price,
    bid: price - 0.4,
    ask: price + 0.4,
    fairValue: price,
  };
}

test('ETF NAV follows its weighted basket and trades on the shared ledger', () => {
  const state = createExchangeEngine({ seed: 'etf-nav', cash: 100_000 });
  assert(state.companies.MKT.isEtf, 'MKT is an ETF');
  assertEqual(state.etfTickers.length, 4, 'four ETFs');
  assertClose(state.quotes.MKT.last, etfNav(state, 'MKT'), 0.05, 'quote starts at NAV');
  assertEqual(latestReport(state, 'MKT'), null, 'ETF has no company report');
  assertEqual(dividendPerShare(state, 'MKT'), 0, 'ETF pays no modelled dividend');

  const cashBefore = state.account.cash;
  const bought = submitOrder(state, {
    ticker: 'MKT', side: 'buy', type: 'market', qty: 10,
  });
  assert(bought.ok && bought.order.filledQty === 10, 'ETF buy filled');
  assertEqual(state.account.positions.MKT.qty, 10, 'ETF position');
  const fee = state.account.trades[state.account.trades.length - 1].fee;
  assertClose(equity(state), cashBefore - fee, 0.1, 'ETF trade only costs the fee');

  const before = state.quotes.MKT.last;
  state.companies.APLA.last *= 1.1;
  state.quotes.APLA.last *= 1.1;
  state.lastNewsDay = 1;
  state.lastMacroDay = 1;
  state.second = 23_399;
  advanceSecond(state);
  assert(state.quotes.MKT.last > before, 'ETF reprices with a stronger basket');
  assertClose(state.quotes.MKT.last, etfNav(state, 'MKT'), 0.1, 'quote tracks NAV');

  const techNav = etfNav(state, 'TECH');
  const ncr = state.companies.NCRT;
  ncr.splitFactor = 2;
  ncr.last /= 2;
  assertClose(etfNav(state, 'TECH'), techNav, 0.2, 'component split keeps ETF NAV');

  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.account.positions.MKT.qty, 10, 'ETF position restored');
  assert(restored.companies.MKT.isEtf, 'ETF flag restored');
  assertClose(restored.quotes.MKT.last, etfNav(restored, 'MKT'), 0.1, 'NAV restored');
});

test('option chains are deterministic, complete and priced with the smile', () => {
  const state = createExchangeEngine({ seed: 'option-chain' });
  const chain = buildOptionChain(state, 'APLA', 30, 2);
  assertEqual(chain.expiries.length, 3, 'three tenors');
  assertEqual(chain.strikes.length, 5, 'five strikes');
  assertEqual(chain.contracts.length, 10, 'call and put per strike');
  assert(chain.strikes.includes(chain.strikes[2]), 'ATM strike');
  const again = buildOptionChain(state, 'APLA', 30, 2);
  assertEqual(JSON.stringify(again.contracts), JSON.stringify(chain.contracts), 'deterministic');
  for (const contract of chain.contracts) {
    assert(contract.ask >= contract.bid, 'two-sided quote');
    assert(contract.premium >= contract.intrinsic, 'premium above intrinsic');
    assert(contract.vol >= 0.12, 'vol floor');
    assert(contract.delta >= -1 && contract.delta <= 1, 'delta bounds');
    assert(contract.expiryDay > state.dayIndex, 'future expiry');
  }
  const atmCall = chain.contracts.find((contract) => contract.type === 'call');
  const atmPut = chain.contracts.find((contract) => contract.type === 'put');
  const parity = atmCall.premium - atmPut.premium;
  const forward = atmCall.strike * Math.exp(-atmCall.rate * 30 / 252);
  assertClose(parity, chain.spot - forward, 0.2, 'put-call parity');
});

test('buying a call debits cash, marks to market and closes with realised PnL', () => {
  const state = createExchangeEngine({ seed: 'option-long', cash: 100_000 });
  const chain = buildOptionChain(state, 'APLA', 30, 2);
  const contract = chain.contracts.find((item) => item.type === 'call'
    && item.strike === chain.strikes[2]);
  assert(contract, 'ATM call exists');
  const cashBefore = state.account.cash;
  const opened = submitOptionOrder(state, {
    side: 'buy', ticker: 'APLA', type: 'call',
    strike: contract.strike, expiryDay: contract.expiryDay, qty: 2,
  });
  assert(opened.ok, 'call bought');
  assertEqual(state.account.options.length, 1, 'one option position');
  assertEqual(state.account.options[0].qty, 2, 'two contracts');
  assertClose(state.account.cash, cashBefore - contract.ask * 100 * 2 - opened.fee, 0.02,
    'premium and fee debited');
  assertEqual(state.account.trades[state.account.trades.length - 1].asset, 'option',
    'option trade on the shared ledger');
  assert(optionRows(state)[0].mark > 0, 'mark exists');
  assertClose(equity(state), cashBefore - opened.fee
    + (contract.premium - contract.ask) * 100 * 2, 0.2, 'equity marks the spread');

  const closed = closeOptionPosition(state, state.account.options[0].key, 1);
  assert(closed.ok, 'half closed');
  assertEqual(state.account.options[0].qty, 1, 'one contract remains');
  assertClose(closed.realized, (closed.price - contract.ask) * 100
    - opened.fee / 2 - closed.fee, 0.02, 'long close PnL');
  const finalClose = closeOptionPosition(state, state.account.options[0].key, 1);
  assert(finalClose.ok, 'remainder closed');
  assertEqual(state.account.options.length, 0, 'flat');
  assert(state.account.realizedPnl !== 0 || closed.realized === 0, 'realised PnL recorded');
});

test('uncovered short puts post collateral while covered calls do not', () => {
  const state = createExchangeEngine({ seed: 'option-short', cash: 100_000 });
  const chain = buildOptionChain(state, 'NCRT', 30, 2);
  const atmPut = chain.contracts.find((item) => item.type === 'put'
    && item.strike === chain.strikes[2]);
  const sold = submitOptionOrder(state, {
    side: 'sell', ticker: 'NCRT', type: 'put',
    strike: atmPut.strike, expiryDay: atmPut.expiryDay, qty: 1,
  });
  assert(sold.ok, 'short put accepted');
  assertEqual(state.account.options[0].qty, -1, 'short contract');
  assert(optionCollateral(state) >= atmPut.strike * 100 - 0.01, 'naked put collateral');
  assert(marginSnapshot(state).optionRequirement >= atmPut.strike * 100 - 0.01,
    'margin snapshot includes collateral');
  const closed = closeOptionPosition(state, state.account.options[0].key, 1);
  assert(closed.ok, 'short put closed');
  assertEqual(state.account.options.length, 0, 'flat put');

  const coveredState = createExchangeEngine({ seed: 'option-covered', cash: 100_000 });
  const bought = submitOrder(coveredState, {
    ticker: 'APLA', side: 'buy', type: 'market', qty: 100,
  });
  assert(bought.ok && bought.order.filledQty === 100, '100 shares bought');
  const coveredChain = buildOptionChain(coveredState, 'APLA', 30, 2);
  const coveredCall = coveredChain.contracts.find((item) => item.type === 'call'
    && item.strike === coveredChain.strikes[2]);
  const covered = submitOptionOrder(coveredState, {
    side: 'sell', ticker: 'APLA', type: 'call',
    strike: coveredCall.strike, expiryDay: coveredCall.expiryDay, qty: 1,
  });
  assert(covered.ok, 'covered call accepted');
  assertClose(marginSnapshot(coveredState).optionRequirement, 0,
    0.01, 'covered call needs no cash collateral');
});

test('an in-the-money option expires into physical shares', () => {
  const state = createExchangeEngine({ seed: 'option-expiry', cash: 100_000 });
  const chain = buildOptionChain(state, 'APLA', 30, 2);
  const contract = chain.contracts.find((item) => item.type === 'call'
    && item.strike === chain.strikes[2]);
  const opened = submitOptionOrder(state, {
    side: 'buy', ticker: 'APLA', type: 'call',
    strike: contract.strike, expiryDay: contract.expiryDay, qty: 1,
  });
  assert(opened.ok, 'call bought');
  const basis = state.account.options[0].costBasis;
  const cashBefore = state.account.cash;
  const spot = contract.strike + 10;
  setMarket(state, 'APLA', spot);
  state.lastNewsDay = contract.expiryDay + 1;
  state.lastMacroDay = contract.expiryDay + 1;
  state.dayIndex = contract.expiryDay;
  state.second = 23_399;
  advanceSecond(state);
  assertEqual(state.account.options.length, 0, 'expired contract removed');
  assertEqual(state.account.optionSettlements.length, 1, 'settlement recorded');
  assertEqual(state.account.optionSettlements[0].delivery, 'shares', 'physical delivery');
  assertEqual(state.account.optionSettlements[0].shares, 100, '100 shares delivered');
  assertEqual(state.account.positions.APLA.qty, 100, 'shares in the account');
  assertClose(state.account.cash, cashBefore - contract.strike * 100, 0.02,
    'strike paid in cash');
  assertClose(state.account.positions.APLA.avgCost,
    (contract.strike * 100 + basis) / 100, 0.02, 'premium capitalised into basis');
  assertClose(state.account.optionSettlements[0].realized, 0, 0.02,
    'no separate realized PnL on exercise');
  assertEqual(state.account.trades[state.account.trades.length - 1].asset, 'option',
    'settlement ledger entry');

  const shortState = createExchangeEngine({ seed: 'option-expiry-short', cash: 100_000 });
  const shortChain = buildOptionChain(shortState, 'NCRT', 30, 2);
  const put = shortChain.contracts.find((item) => item.type === 'put'
    && item.strike === shortChain.strikes[2]);
  const sold = submitOptionOrder(shortState, {
    side: 'sell', ticker: 'NCRT', type: 'put',
    strike: put.strike, expiryDay: put.expiryDay, qty: 1,
  });
  assert(sold.ok, 'short put opened');
  const shortBasis = shortState.account.options[0].costBasis;
  setMarket(shortState, 'NCRT', put.strike + 20);
  shortState.lastNewsDay = put.expiryDay + 1;
  shortState.lastMacroDay = put.expiryDay + 1;
  shortState.dayIndex = put.expiryDay;
  shortState.second = 23_399;
  advanceSecond(shortState);
  assertEqual(shortState.account.options.length, 0, 'short put expired');
  assertClose(shortState.account.realizedPnl, shortBasis, 0.02,
    'short put keeps the premium');
  assertEqual(shortState.account.optionSettlements[0].cashDelta, 0, 'no intrinsic payout');
});

test('a large uncovered call position is liquidated when margin breaks', () => {
  const state = createExchangeEngine({ seed: 'option-margin-call', cash: 100_000 });
  const chain = buildOptionChain(state, 'NCRT', 30, 2);
  const call = chain.contracts.find((item) => item.type === 'call'
    && item.strike === chain.strikes[2]);
  const lots = 50;
  const sold = submitOptionOrder(state, {
    side: 'sell', ticker: 'NCRT', type: 'call',
    strike: call.strike, expiryDay: call.expiryDay, qty: lots,
  });
  assert(sold.ok, 'large uncovered call sold inside initial margin');
  setMarket(state, 'NCRT', 120);
  const snapshot = marginSnapshot(state);
  assert(snapshot.maintenanceExcess < 0, 'maintenance breach');
  state.dayIndex = 1;
  checkMargin(state);
  assertEqual(state.account.options.length, 0, 'short call liquidated');
  assertEqual(state.account.margin.forcedLiquidations[0].action, 'closeShortOption',
    'option liquidation recorded');
});

test('corporate bonds price from the curve, trade and pay quarterly coupons', () => {
  const state = createExchangeEngine({ seed: 'bond-test', cash: 100_000 });
  const bond = SIM_BOND_BY_ID.APLA5;
  const quote = bondQuote(state, bond);
  assert(quote.mid > 70 && quote.mid < 130, 'bond price in a plausible range');
  assert(quote.ask > quote.bid, 'two-sided bond quote');
  assert(quote.yieldPct > 0, 'positive yield');

  const cashBefore = state.account.cash;
  const bought = submitBondOrder(state, { id: bond.id, side: 'buy', qty: 10 });
  assert(bought.ok, 'bond bought');
  assertEqual(state.account.bonds[bond.id].qty, 10, 'bond position');
  assertClose(state.account.cash, cashBefore - bought.cost, 0.02, 'cash debited');
  assertClose(equity(state), cashBefore - bought.fee
    + (quote.mid - quote.ask) * 10, 0.2, 'bond marked at mid');
  assertEqual(state.account.trades[state.account.trades.length - 1].asset, 'bond',
    'bond trade on the shared ledger');

  const sold = submitBondOrder(state, { id: bond.id, side: 'sell', qty: 5 });
  assert(sold.ok, 'half sold');
  assertEqual(state.account.bonds[bond.id].qty, 5, 'remaining bonds');
  assertClose(sold.realized, sold.proceeds - bought.cost / 2, 0.05, 'bond sale PnL');
  assert(bondRows(state).length === 1, 'bond position row');

  const couponState = createExchangeEngine({ seed: 'bond-coupon', cash: 100_000 });
  const couponBond = SIM_BOND_BY_ID.NCRT5;
  submitBondOrder(couponState, { id: couponBond.id, side: 'buy', qty: 10 });
  couponState.lastNewsDay = 63;
  couponState.lastMacroDay = 63;
  couponState.dayIndex = SIM_BOND_COUPON_DAYS - 1;
  couponState.second = 23_399;
  const cashBeforeCoupon = couponState.account.cash;
  advanceSecond(couponState);
  assertEqual(couponState.dayIndex, SIM_BOND_COUPON_DAYS, 'coupon day');
  assertEqual(couponState.account.coupons.length, 1, 'coupon paid');
  assertClose(couponState.account.coupons[0].amount, 10 * couponBond.coupon / 4, 0.02,
    'quarterly coupon amount');
  assertClose(couponState.account.cash, cashBeforeCoupon + 10 * couponBond.coupon / 4, 0.02,
    'coupon credited');
  assert(couponState.account.bonds[couponBond.id].lastCouponDay === 63, 'coupon day marked');
  assert(marginSnapshot(couponState).bondMarketValue > 0, 'bond value in margin snapshot');
});

test('save and restore keep ETF, option and bond positions together', () => {
  const state = createExchangeEngine({ seed: 'phase5-save', cash: 100_000 });
  submitOrder(state, { ticker: 'MKT', side: 'buy', type: 'market', qty: 10 });
  const chain = buildOptionChain(state, 'APLA', 30, 2);
  const call = chain.contracts.find((item) => item.type === 'call'
    && item.strike === chain.strikes[2]);
  submitOptionOrder(state, {
    side: 'buy', ticker: 'APLA', type: 'call',
    strike: call.strike, expiryDay: call.expiryDay, qty: 1,
  });
  submitBondOrder(state, { id: SIM_BONDS[0].id, side: 'buy', qty: 5 });
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.account.positions.MKT.qty, 10, 'ETF restored');
  assertEqual(restored.account.options.length, 1, 'option restored');
  assertEqual(restored.account.options[0].qty, 1, 'option quantity restored');
  assertEqual(restored.account.bonds[SIM_BONDS[0].id].qty, 5, 'bond restored');
  assertClose(equity(restored), equity(state), 0.3, 'total equity restored');
});
