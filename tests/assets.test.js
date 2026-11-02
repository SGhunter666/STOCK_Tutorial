/**
 * Bond and FX tests: deterministic pricing, cash accounting, coupons, marking
 * and equity integration.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import { macroWorld } from '../js/market/macro.js';
import { equity } from '../js/trading/account.js';
import {
  BOND_DEFS, bondDef, bondPrice, bondYield, buyBond, sellBond, markBonds,
  applyBondCoupons, bondValue, BOND_FACE,
} from '../js/assets/bonds.js';
import {
  FX_PAIRS, fxRate, fxRates, buyFx, sellFx, markFx, fxValue,
} from '../js/assets/fx.js';
import {
  COMMODITY_DEFS, commodityDef, commodityPrice, commodityQuotes,
  buyCommodity, sellCommodity, markCommodities, commodityValue,
} from '../js/assets/commodities.js';
import {
  CRYPTO_DEFS, cryptoDef, cryptoPrice, cryptoQuotes,
  buyCrypto, sellCrypto, markCrypto, cryptoValue,
} from '../js/assets/crypto.js';

suite('Bonds');

test('bond yields and prices respond to the curve and credit spread', () => {
  const macro = macroWorld(0, 'asset-test');
  const gov = bondDef('gov10');
  const corp = bondDef('corpBBB10');
  assert(gov && corp, 'bond definitions exist');
  assert(bondYield(corp, macro) > bondYield(gov, macro), 'credit spread raises corporate yield');
  const price = bondPrice(gov, macro);
  assert(price > 0 && price < BOND_FACE * 1.5, 'price is a plausible present value');
  const higherCurve = { ...macro, yield2: macro.yield2 + 1, yield10: macro.yield10 + 1 };
  assert(bondPrice(gov, higherCurve) < price, 'higher yields lower bond prices');
  assertEqual(BOND_DEFS.length, 8, 'eight teaching bonds');
});

test('bond buys, marks, coupons and sells reconcile cash and equity', () => {
  const state = createGameState({ seed: 'asset-bond' });
  const macro = macroWorld(0, 'asset-bond');
  const bond = bondDef('gov5');
  const account = { ...state.account, cash: 10000, initialCash: 10000 };
  const bought = buyBond(account, bond, macro, { qty: 2, fee: 1, day: 0 });
  assert(bought.ok, 'bond purchase succeeds');
  assertEqual(bought.account.bonds.length, 1, 'position recorded');
  assertEqual(bought.account.bonds[0].qty, 2, 'quantity recorded');
  assert(equity(bought.account, {}) > 0, 'equity includes bond value');
  const beforeCash = bought.account.cash;
  const coupons = applyBondCoupons(bought.account, macro, 63);
  assert(coupons.total > 0, 'quarterly coupon paid');
  assertEqual(coupons.account.cash, Math.round((beforeCash + coupons.total) * 100) / 100, 'coupon credited');
  const sold = sellBond(coupons.account, 'gov5', macro, { qty: 1, fee: 1 });
  assert(sold.ok, 'partial sale succeeds');
  assertEqual(sold.account.bonds[0].qty, 1, 'one bond remains');
  assert(Number.isFinite(sold.realized), 'realised P&L reported');
  const marked = markBonds(sold.account, { ...macro, yield10: macro.yield10 + 1 });
  assert(marked.bonds[0].currentPrice < sold.account.bonds[0].currentPrice, 'marking follows yields');
});

test('bond errors cover unknown, missing and oversized positions', () => {
  const account = createGameState({ seed: 'asset-bond-errors' }).account;
  const macro = macroWorld(0, 'asset-bond-errors');
  assertEqual(buyBond(account, null, macro, { qty: 1 }).error, 'bond.errorUnknown');
  assertEqual(sellBond(account, 'gov2', macro, { qty: 1 }).error, 'bond.errorNoPosition');
  const bought = buyBond(account, bondDef('gov2'), macro, { qty: 1, day: 0 });
  assertEqual(sellBond(bought.account, 'gov2', macro, { qty: 2 }).error, 'bond.errorInsufficient');
});

suite('FX');

test('FX rates are deterministic and positions mark in USD', () => {
  const state = createGameState({ seed: 'asset-fx' });
  const macro = macroWorld(0, 'asset-fx');
  const first = fxRates(0, 'asset-fx', macro);
  const again = fxRates(0, 'asset-fx', macro);
  assertEqual(JSON.stringify(first), JSON.stringify(again), 'rates are deterministic');
  for (const pair of FX_PAIRS) {
    assert(first[pair.id] > 0, `${pair.id} has a positive rate`);
    assertClose(fxRate(pair.id, 0, 'asset-fx', macro), first[pair.id], 1e-9, 'single quote matches map');
  }
  const account = { ...state.account, cash: 10000, initialCash: 10000 };
  const bought = buyFx(account, 'EURUSD', first, { units: 100, fee: 1, day: 0 });
  assert(bought.ok, 'FX purchase succeeds');
  assertEqual(bought.account.fx[0].units, 100, 'units recorded');
  assert(equity(bought.account, {}) > 0, 'equity includes FX value');
  const futureRates = fxRates(30, 'asset-fx', macroWorld(30, 'asset-fx'));
  const marked = markFx(bought.account, futureRates);
  assertEqual(marked.fx[0].currentRate, futureRates.EURUSD, 'position marked to the new rate');
  const sold = sellFx(marked, 'EURUSD', futureRates, { units: 100, fee: 1 });
  assert(sold.ok, 'FX sale succeeds');
  assertEqual(sold.account.fx.length, 0, 'position closed');
  assert(Number.isFinite(sold.realized), 'realised FX P&L reported');
});

test('FX errors cover unknown pairs, missing positions and oversized sales', () => {
  const account = createGameState({ seed: 'asset-fx-errors' }).account;
  const rates = fxRates(0, 'asset-fx-errors', macroWorld(0, 'asset-fx-errors'));
  assertEqual(buyFx(account, 'ZZZUSD', rates, { units: 1 }).error, 'fx.errorUnknown');
  assertEqual(sellFx(account, 'EURUSD', rates, { units: 1 }).error, 'fx.errorNoPosition');
  const bought = buyFx(account, 'EURUSD', rates, { units: 5, day: 0 });
  assertEqual(sellFx(bought.account, 'EURUSD', rates, { units: 10 }).error, 'fx.errorInsufficient');
});

suite('Commodities');

test('commodity prices are deterministic, macro-sensitive and tradable', () => {
  const macro = macroWorld(0, 'asset-commodity');
  const quotes = commodityQuotes(0, 'asset-commodity', macro);
  const again = commodityQuotes(0, 'asset-commodity', macro);
  assertEqual(COMMODITY_DEFS.length, 5, 'five teaching commodities');
  assertEqual(JSON.stringify(quotes), JSON.stringify(again), 'quotes are deterministic');
  for (const row of quotes) {
    assert(row.price > 0, `${row.id} has a positive price`);
    assert(Number.isFinite(row.changePct), `${row.id} change is numeric`);
  }
  const gold = commodityDef('gold');
  assert(commodityPrice(gold, 0, 'asset-commodity', macro) > 0, 'gold price is positive');
  const higherRates = { ...macro, realRate: macro.realRate + 1 };
  assert(commodityPrice(gold, 0, 'asset-commodity', higherRates) < commodityPrice(gold, 0, 'asset-commodity', macro), 'higher real rates weigh on gold');

  const account = { ...createGameState({ seed: 'asset-commodity' }).account, cash: 10000, initialCash: 10000 };
  const bought = buyCommodity(account, 'gold', gold.base, { qty: 2, fee: 1, day: 0 });
  assert(bought.ok, 'commodity purchase succeeds');
  assertEqual(bought.account.commodities[0].qty, 2, 'quantity recorded');
  assert(commodityValue(bought.account) > 0, 'commodity value is positive');
  assert(equity(bought.account, {}) > 0, 'equity includes commodities');
  const marked = markCommodities(bought.account, { gold: gold.base + 10 });
  assert(marked.commodities[0].currentPrice === gold.base + 10, 'marking updates the price');
  const sold = sellCommodity(marked, 'gold', gold.base + 10, { qty: 1, fee: 1 });
  assert(sold.ok, 'partial commodity sale succeeds');
  assertEqual(sold.account.commodities[0].qty, 1, 'one unit remains');
  assert(Number.isFinite(sold.realized), 'realised commodity P&L reported');
});

test('commodity errors cover unknown, missing and oversized positions', () => {
  const account = createGameState({ seed: 'asset-commodity-errors' }).account;
  assertEqual(buyCommodity(account, 'zzz', 10, { qty: 1 }).error, 'commodity.errorUnknown');
  assertEqual(sellCommodity(account, 'oil', 70, { qty: 1 }).error, 'commodity.errorNoPosition');
  const bought = buyCommodity(account, 'oil', 70, { qty: 1, day: 0 });
  assertEqual(sellCommodity(bought.account, 'oil', 70, { qty: 2 }).error, 'commodity.errorInsufficient');
});

suite('Crypto');

test('crypto prices are deterministic and fractional positions mark in USD', () => {
  const macro = macroWorld(0, 'asset-crypto');
  const quotes = cryptoQuotes(0, 'asset-crypto', macro);
  const again = cryptoQuotes(0, 'asset-crypto', macro);
  assertEqual(CRYPTO_DEFS.length, 3, 'three teaching crypto assets');
  assertEqual(JSON.stringify(quotes), JSON.stringify(again), 'crypto quotes are deterministic');
  for (const row of quotes) {
    assert(row.price > 0, `${row.id} has a positive price`);
    assert(Number.isFinite(row.changePct), `${row.id} change is numeric`);
  }
  const btc = cryptoDef('BTC');
  assert(cryptoPrice(btc, 0, 'asset-crypto', macro) > 0, 'BTC price is positive');
  const account = { ...createGameState({ seed: 'asset-crypto' }).account, cash: 10000, initialCash: 10000 };
  const bought = buyCrypto(account, 'BTC', btc.base, { qty: 0.05, fee: 1, day: 0 });
  assert(bought.ok, 'fractional crypto purchase succeeds');
  assertEqual(bought.account.crypto[0].units, 0.05, 'fractional units recorded');
  assert(cryptoValue(bought.account) > 0, 'crypto value is positive');
  assert(equity(bought.account, {}) > 0, 'equity includes crypto');
  const marked = markCrypto(bought.account, { BTC: btc.base + 100 });
  assertEqual(marked.crypto[0].currentPrice, btc.base + 100, 'position marked to the new price');
  const sold = sellCrypto(marked, 'BTC', btc.base + 100, { qty: 0.02, fee: 1 });
  assert(sold.ok, 'partial crypto sale succeeds');
  assertClose(sold.account.crypto[0].units, 0.03, 1e-9, 'remaining crypto units');
  assert(Number.isFinite(sold.realized), 'realised crypto P&L reported');
});

test('crypto errors cover unknown assets, invalid units and oversized sales', () => {
  const account = createGameState({ seed: 'asset-crypto-errors' }).account;
  assertEqual(buyCrypto(account, 'DOGE', 1, { qty: 1 }).error, 'crypto.errorUnknown');
  assertEqual(buyCrypto(account, 'ETH', 3000, { qty: 0 }).error, 'crypto.errorQtyInvalid');
  assertEqual(sellCrypto(account, 'ETH', 3000, { qty: 1 }).error, 'crypto.errorNoPosition');
  const bought = buyCrypto(account, 'ETH', 3000, { qty: 0.5, day: 0 });
  assertEqual(sellCrypto(bought.account, 'ETH', 3000, { qty: 1 }).error, 'crypto.errorInsufficient');
});
