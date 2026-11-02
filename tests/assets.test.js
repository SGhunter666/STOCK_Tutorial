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
