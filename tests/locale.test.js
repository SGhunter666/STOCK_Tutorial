/**
 * Locale coverage tests: every key used by the teaching content and UI must exist
 * in both languages, with matching interpolation placeholders.
 */
import { suite, test, assert, assertEqual } from './harness.js';
import { STAGES, ALL_UNITS } from '../js/education/curriculum.js';
import { buildQuizSession } from '../js/education/quizEngine.js';
import { GLOSSARY_TERMS, termKey } from '../js/education/glossary.js';
import { TOOL_DEFS } from '../js/education/unlockManager.js';
import { ACHIEVEMENTS } from '../js/education/progress.js';
import { COMPANIES, SECTORS, getCompany } from '../js/data/companies.js';
import { MARKET_SEGMENTS } from '../js/market/marketAccess.js';
import { HISTORY_SCENARIOS, HISTORY_SECTOR_PACKS } from '../js/data/historyScenarios.js';
import { CAREER_RANKS } from '../js/education/career.js';
import {
  FUND_STRATEGIES, FUND_RISK_PROFILES, FUND_ROLES,
} from '../js/fund/fundEngine.js';
import {
  QUANT_STRATEGIES, QUANT_FACTOR_OPTIONS, QUANT_MODES, QUANT_OBJECTIVES, ML_MODELS,
} from '../js/quant/backtestEngine.js';
import { BOND_DEFS } from '../js/assets/bonds.js';
import { FX_PAIRS } from '../js/assets/fx.js';
import { COMMODITY_DEFS } from '../js/assets/commodities.js';
import { CRYPTO_DEFS } from '../js/assets/crypto.js';
import { SIM_COMPANIES } from '../js/sim/companies50.js';

const zhResponse = await fetch('../locales/zh-CN.json');
const enResponse = await fetch('../locales/en.json');
const zh = await zhResponse.json();
const en = await enResponse.json();

function flatten(dict, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

const zhFlat = flatten(zh);
const enFlat = flatten(en);
const zhKeys = new Set(Object.keys(zhFlat));
const enKeys = new Set(Object.keys(enFlat));

function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

function required(sharedState = true) {
  const missing = [];
  const check = (key, label = '') => {
    if (!key) return;
    if (typeof key !== 'string') return;
    const zhValue = zhFlat[key];
    const enValue = enFlat[key];
    if (zhValue === undefined || enValue === undefined) {
      missing.push(`${key}${label ? ` (${label})` : ''}`);
      return;
    }
    if (placeholders(zhValue) !== placeholders(enValue)) {
      missing.push(`${key} (placeholder mismatch: ${placeholders(zhValue)} vs ${placeholders(enValue)})`);
    }
  };
  return { check, missing };
}

suite('Locale structure');

test('both locales have identical key sets', () => {
  const onlyZh = [...zhKeys].filter((key) => !enKeys.has(key));
  const onlyEn = [...enKeys].filter((key) => !zhKeys.has(key));
  assertEqual(onlyZh.length, 0, `keys only in zh: ${onlyZh.join(', ')}`);
  assertEqual(onlyEn.length, 0, `keys only in en: ${onlyEn.join(', ')}`);
  assert(zhKeys.size > 500, 'dictionary should be substantial');
});

test('no empty translation values', () => {
  const empties = [...zhKeys, ...enKeys].filter((key) => {
    const zhValue = zhFlat[key];
    const enValue = enFlat[key];
    return !zhValue || !enValue || !String(zhValue).trim() || !String(enValue).trim();
  });
  assertEqual(empties.length, 0, `empty values: ${empties.slice(0, 5).join(', ')}`);
});

test('placeholders match across languages for all keys', () => {
  const mismatch = [...zhKeys].filter((key) => (
    enFlat[key] !== undefined && placeholders(zhFlat[key]) !== placeholders(enFlat[key])
  ));
  assertEqual(mismatch.length, 0, `placeholder mismatch: ${mismatch.slice(0, 5).join(', ')}`);
});

suite('Teaching content coverage');

test('all stage and unit titles exist', () => {
  const { check, missing } = required();
  for (const stage of STAGES) {
    check(stage.titleKey);
    check(stage.summaryKey);
    for (const unit of stage.units) {
      check(unit.titleKey);
      check(unit.summaryKey);
      if (unit.implemented) {
        for (const section of unit.sections) check(section.titleKey);
        check(unit.practice.titleKey);
        check(unit.practice.requirementKey);
        check(unit.practice.hintKey);
        check(unit.practice.actionKey);
      }
    }
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('all lesson block keys exist in both languages', () => {
  const { check, missing } = required();
  for (const unit of ALL_UNITS.filter((entry) => entry.implemented)) {
    for (const section of unit.sections) {
      for (const block of section.blocks) {
        if (block.type === 'p') check(block.key);
        if (block.type === 'list') {
          check(block.titleKey);
          block.items.forEach((key) => check(key));
        }
        if (block.type === 'callout') {
          check(block.titleKey);
          check(block.key);
        }
        if (block.type === 'formula') {
          check(block.key);
          check(block.noteKey);
        }
        if (block.type === 'example') {
          check(block.titleKey);
          block.lines.forEach((key) => check(key));
        }
        if (block.type === 'table') {
          block.headKeys.forEach((key) => check(key));
          block.rows.forEach((row) => row.forEach((key) => check(key)));
        }
      }
    }
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('all quiz prompts, options, explanations and worked solutions exist', () => {
  const { check, missing } = required();
  for (const unit of ALL_UNITS.filter((entry) => entry.implemented)) {
    const session = buildQuizSession(unit.id, 1);
    for (const question of session.questions) {
      check(question.promptKey);
      check(question.explainKey);
      if (question.workKey) check(question.workKey);
      for (const option of question.options) check(option.key);
      check(`quiz.type.${question.type}`);
      if (question.answerFormat) check(`quiz.unit.${question.answerFormat}`);
    }
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('quiz ui keys exist', () => {
  const { check, missing } = required();
  [
    'quiz.title', 'quiz.subtitle', 'quiz.placementTitle', 'quiz.placementSubtitle',
    'quiz.eyebrow', 'quiz.placementEyebrow', 'quiz.questionOf', 'quiz.singleHint',
    'quiz.multiHint', 'quiz.numericHint', 'quiz.submit', 'quiz.rulesTitle',
    'quiz.ruleQuestions', 'quiz.rulePass', 'quiz.rulePlacement', 'quiz.ruleRetry',
    'quiz.dotsTitle', 'quiz.noteLabel', 'quiz.noteText', 'quiz.resultsTitle',
    'quiz.placementResultsTitle', 'quiz.resultsEyebrow', 'quiz.scoreLabel', 'quiz.passed',
    'quiz.failed', 'quiz.placementPassed', 'quiz.placementFailed', 'quiz.passedText',
    'quiz.failedText', 'quiz.placementPassedText', 'quiz.placementFailedText',
    'quiz.unitCompleted', 'quiz.continuePractice', 'quiz.retry', 'quiz.nextUnit',
    'quiz.backToAcademy',
    'quiz.reviewTitle', 'quiz.correct', 'quiz.incorrect', 'quiz.yourAnswer',
    'quiz.correctAnswer', 'quiz.explanation', 'quiz.noAnswer', 'quiz.millionsUnit',
    'quiz.answerAll', 'quiz.answerThis', 'quiz.bestScore', 'quiz.notAttempted',
    'quiz.start', 'quiz.cardTitle', 'quiz.cardSubtitle', 'quiz.lockedText',
    'quiz.unavailable', 'quiz.unavailableText', 'common.true', 'common.false',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('all glossary terms have bilingual names, definitions and examples', () => {
  const { check, missing } = required();
  for (const term of GLOSSARY_TERMS) {
    ['name', 'def', 'example'].forEach((field) => check(termKey(term.id, field)));
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('all unlock and achievement descriptions exist', () => {
  const { check, missing } = required();
  for (const tool of Object.values(TOOL_DEFS)) {
    check(tool.titleKey);
    check(tool.descKey);
    check(tool.categoryKey);
  }
  ['unlock.howToUnlock', 'unlock.phaseNote', 'unlock.requiresSection', 'unlock.requiresUnit', 'unlock.unknown']
    .forEach((key) => check(key));
  [2, 3, 4, 5].forEach((phase) => check(`unlock.phase.${phase}`));
  for (const achievement of ACHIEVEMENTS) {
    check(achievement.titleKey);
    check(achievement.descKey);
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('all companies and sectors are localised', () => {
  const { check, missing } = required();
  for (const company of COMPANIES) {
    check(`company.${company.ticker}.name`);
    check(`company.${company.ticker}.desc`);
  }
  for (const sector of SECTORS) check(`sector.${sector}`);
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('all market segments are localised', () => {
  const { check, missing } = required();
  ['market.segmentsTitle', 'market.segmentsSubtitle', 'market.showAll', 'market.segmentCount',
    'market.segmentUnlocked', 'market.segmentLocked', 'market.segmentLockedShort',
    'market.segmentCompanies', 'market.segmentUnlockHint', 'market.goUnlock',
    'trade.lockedTitle', 'trade.lockedText', 'trade.lockedNote', 'trade.backToMarket',
    'error.marketLocked', 'toast.marketSegmentUnlocked', 'market.companiesSubtitle']
    .forEach((key) => check(key));
  for (const segment of MARKET_SEGMENTS) {
    check(segment.nameKey);
    check(segment.descKey);
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('historical replay content is localised', () => {
  const { check, missing } = required();
  [
    'nav.history', 'history.eyebrow', 'history.title', 'history.subtitle',
    'history.realDataBadge', 'history.periodLabel', 'history.universeLabel',
    'history.durationLabel', 'history.tickersCount', 'history.daysCount',
    'history.startHint', 'history.continueHint', 'history.start', 'history.continue',
    'history.sourceTitle', 'history.sourceNote', 'history.adjustedNote',
    'history.splitNoticeLabel', 'history.splitNotice',
    'history.disclaimerLabel', 'history.disclaimer', 'history.scenarioEyebrow',
    'history.independentAccount', 'history.currentDate', 'history.day', 'history.dayShort',
    'history.dayOf', 'history.nextEvent', 'history.atEnd', 'history.reset',
    'history.resetShort', 'history.resetTitle', 'history.resetMessage',
    'history.resetConfirm', 'history.resetDone', 'history.statEquity',
    'history.sinceStartPct', 'history.statCash', 'history.statCashSub', 'history.statPnl',
    'history.statPnlSub', 'history.statBenchmark', 'history.statBenchmarkSub',
    'history.chartTitle', 'history.chartSubtitle', 'history.chartNote', 'history.avgCostLine',
    'history.timelineLabel', 'history.timelineRange', 'history.warmupNote',
    'history.clockLabel', 'history.clockNote', 'history.tickOf', 'history.play',
    'history.pause', 'history.nextDay', 'history.jumpLabel', 'history.chartRangeAll',
    'history.chartRangeRecent', 'history.closePrice', 'history.fillNote',
    'history.tf.5m', 'history.tf.15m', 'history.tf.1h', 'history.tf.1d',
    'history.tf.1w', 'history.tf.1mo', 'history.tf.1y', 'history.chartNoteIntraday',
    'history.avgCostMarker', 'history.ticketTitle', 'history.ticketSubtitle',
    'history.selected', 'history.cashLine', 'history.sharesLine', 'history.closePrice',
    'history.fillNote', 'history.feeNote', 'history.universeTitle', 'history.universeSubtitle',
    'history.owned', 'history.benchmark', 'history.select', 'history.selectedLabel',
    'history.positionsTitle', 'history.positionsSubtitle', 'history.noPositions',
    'history.tradesTitle', 'history.tradesSubtitle', 'history.noTrades',
    'history.eventsTitle', 'history.eventsSubtitle', 'history.eventsEmpty',
    'history.tipsTitle', 'history.independentLabel', 'history.independentNote',
    'history.loading', 'history.loadError', 'history.backToList', 'history.buyToast',
    'history.sellToast', 'history.eventReached', 'history.endReached',
    'history.allGroups', 'history.filterPlaceholder', 'history.noMatches',
    'sector.realestate', 'sector.energy', 'sector.communication', 'error.benchmarkNotTradable',
  ].forEach((key) => check(key));
  for (const pack of HISTORY_SECTOR_PACKS) {
    check(pack.labelKey);
  }
  for (const scenario of HISTORY_SCENARIOS) {
    check(scenario.titleKey);
    check(scenario.subtitleKey);
    check(scenario.descKey);
    check(scenario.periodKey);
    check(scenario.difficultyKey);
    if (scenario.badgeKey) check(scenario.badgeKey);
    scenario.tips.forEach((key) => check(key));
    for (const event of scenario.events) {
      check(event.titleKey);
      check(event.textKey);
    }
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('news templates and kinds exist', () => {
  const { check, missing } = required();
  const templates = [
    'earningsBeat', 'earningsMiss', 'contractWin', 'lawsuit', 'ceoExit', 'recall',
    'upgrade', 'downgrade', 'rateCut', 'rateHike', 'inflationCool', 'inflationHot',
    'growthStrong', 'recessionFear',
  ];
  templates.forEach((template) => check(`news.template.${template}`));
  ['company', 'macro'].forEach((kind) => check(`news.kind.${kind}`));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('demo and practice content is localised', () => {
  const { check, missing } = required();
  [
    'demo.common.note', 'demo.marketCap.title', 'demo.marketCap.desc', 'demo.marketCap.company',
    'demo.marketCap.price', 'demo.marketCap.shares', 'demo.marketCap.cap', 'demo.marketCap.compare',
    'demo.spread.title', 'demo.spread.desc', 'demo.spread.bid', 'demo.spread.ask',
    'demo.spread.hint', 'demo.spread.qty', 'demo.spread.spread', 'demo.spread.roundTrip',
    'demo.spread.cost',
    'demo.pnl.title', 'demo.pnl.desc', 'demo.pnl.buyPrice', 'demo.pnl.sellPrice', 'demo.pnl.qty',
    'demo.pnl.invested', 'demo.pnl.proceeds', 'demo.pnl.fees', 'demo.pnl.net',
    'demo.pnl.returnLine', 'demo.pnl.chartTitle', 'demo.pnl.chartNote', 'demo.pnl.breakeven',
    'demo.limitOrder.title', 'demo.limitOrder.desc', 'demo.limitOrder.current',
    'demo.limitOrder.limit', 'demo.limitOrder.qty', 'demo.limitOrder.simulate',
    'demo.limitOrder.hint', 'demo.limitOrder.limitLabel', 'demo.limitOrder.idle',
    'demo.limitOrder.filled', 'demo.limitOrder.notFilled',
    'demo.dividend.title', 'demo.dividend.desc', 'demo.dividend.shares',
    'demo.dividend.price', 'demo.dividend.yield', 'demo.dividend.perShare',
    'demo.dividend.annual', 'demo.dividend.quarterly', 'demo.dividend.tenYear',
    'demo.dividend.note',
    'demo.stockStyle.title', 'demo.stockStyle.desc', 'demo.stockStyle.company',
    'demo.stockStyle.style', 'demo.stockStyle.sector', 'demo.stockStyle.yield',
    'demo.stockStyle.noDividend',
    'demo.diversification.title', 'demo.diversification.desc', 'demo.diversification.basket',
    'demo.diversification.singleVol', 'demo.diversification.basketVol',
    'demo.diversification.note', 'demo.diversification.start',
    'demo.compounding.title', 'demo.compounding.desc', 'demo.compounding.initial',
    'demo.compounding.monthly', 'demo.compounding.rate', 'demo.compounding.years',
    'demo.compounding.final', 'demo.compounding.contributed', 'demo.compounding.growth',
    'demo.compounding.note', 'demo.compounding.start', 'demo.compounding.end',
    'demo.candle.title', 'demo.candle.desc', 'demo.candle.open', 'demo.candle.high',
    'demo.candle.low', 'demo.candle.close', 'demo.candle.session', 'demo.candle.type',
    'demo.candle.bull', 'demo.candle.bear', 'demo.candle.body', 'demo.candle.range',
    'demo.candle.note',
    'demo.indicators.title', 'demo.indicators.desc', 'demo.indicators.company',
    'demo.indicators.sma20', 'demo.indicators.sma50', 'demo.indicators.rsi',
    'demo.indicators.golden', 'demo.indicators.death', 'demo.indicators.notEnough',
    'demo.indicators.note', 'demo.indicators.start',
    'demo.financials.title', 'demo.financials.desc', 'demo.financials.company',
    'demo.financials.revenue', 'demo.financials.grossProfit', 'demo.financials.netIncome',
    'demo.financials.assets', 'demo.financials.liabilities', 'demo.financials.equity',
    'demo.financials.cash', 'demo.financials.debt', 'demo.financials.fcf',
    'demo.financials.note',
    'demo.dcf.title', 'demo.dcf.desc', 'demo.dcf.fcf', 'demo.dcf.growth',
    'demo.dcf.years', 'demo.dcf.discount', 'demo.dcf.terminal', 'demo.dcf.shares',
    'demo.dcf.netDebt', 'demo.dcf.enterprise', 'demo.dcf.equity', 'demo.dcf.perShare',
    'demo.dcf.terminalShare', 'demo.dcf.invalid', 'demo.dcf.note',
    'demo.macro.title', 'demo.macro.desc', 'demo.macro.rate', 'demo.macro.inflation',
    'demo.macro.growth', 'demo.macro.realRate', 'demo.macro.regime', 'demo.macro.discount',
    'demo.macro.note',
    'demo.allocation.title', 'demo.allocation.desc', 'demo.allocation.stocks',
    'demo.allocation.bonds', 'demo.allocation.stockWeight', 'demo.allocation.bondWeight',
    'demo.allocation.cashWeight', 'demo.allocation.expected', 'demo.allocation.volatility',
    'demo.allocation.note',
    'demo.risk.title', 'demo.risk.desc', 'demo.risk.account', 'demo.risk.riskPct',
    'demo.risk.entry', 'demo.risk.stop', 'demo.risk.riskAmount', 'demo.risk.perShare',
    'demo.risk.shares', 'demo.risk.position', 'demo.risk.exposure', 'demo.risk.note',
    'demo.strategies.title', 'demo.strategies.desc', 'demo.strategies.horizon',
    'demo.strategies.sessions', 'demo.strategies.note',
    'macro.regime.expansion', 'macro.regime.slowdown', 'macro.regime.inflation',
    'macro.regime.neutral',
    'stockStyle.growth', 'stockStyle.growthDesc', 'stockStyle.value', 'stockStyle.valueDesc',
    'stockStyle.dividend', 'stockStyle.dividendDesc', 'stockStyle.cyclical', 'stockStyle.cyclicalDesc',
    'trade.stockStyle',
  ].forEach((key) => check(key));
  const stage5DemoKeys = {
    shortPnl: ['title', 'desc', 'entry', 'exit', 'shares', 'proceeds', 'coverCost', 'pnl', 'return', 'collateral', 'note'],
    margin: ['title', 'desc', 'cash', 'price', 'shares', 'value', 'loan', 'equity', 'leverage', 'interest', 'note'],
    stopOrder: ['title', 'desc', 'entry', 'stop', 'trail', 'shares', 'perShare', 'distance', 'risk', 'trailing', 'note'],
    orderBook: ['title', 'desc', 'ticker', 'qty', 'ask', 'bid', 'avgPrice', 'slippage', 'filled', 'note'],
  };
  for (const [demoId, fields] of Object.entries(stage5DemoKeys)) {
    fields.forEach((field) => check(`demo.${demoId}.${field}`));
  }
  [
    'trade.short', 'trade.cover', 'trade.stopOrder', 'trade.trailingOrder', 'trade.stopPrice',
    'trade.trailAmount', 'trade.trailHint', 'trade.shortable', 'trade.shortPositionHint',
    'trade.shortLockedHint', 'trade.stopLockedHint', 'trade.estimateTrigger',
    'trade.estimateMargin', 'trade.estimateNoteConditional', 'trade.submitShort',
    'trade.submitCover', 'trade.triggerPrice', 'trade.shortMarker', 'trade.marginDebt',
    'trade.depthTitle', 'trade.depthSubtitle', 'trade.depthLocked', 'trade.depthUnlock',
    'trade.depthLevels', 'trade.depthSize', 'trade.depthAvg', 'trade.depthSlippage',
    'trade.depthFilled', 'trade.depthNote',
    'trade.validation.stop', 'trade.validation.trail', 'trade.validation.stopDirection',
    'trade.validation.margin', 'trade.validation.shortShares',
    'error.positionIsShort', 'error.positionIsLong', 'error.noShortPosition',
    'error.insufficientShortShares', 'error.insufficientMargin', 'error.stopDirection',
    'error.shortLocked', 'error.stopLocked',
    'toast.dividendOwed', 'toast.financingCharged', 'toast.marginCall',
  ].forEach((key) => check(key));
  ['buy', 'sell', 'short', 'cover'].forEach((side) => {
    ['market', 'limit', 'stop', 'trailing'].forEach((type) => check(`trade.explain.${side}.${type}`));
  });
  const stage6DemoKeys = {
    optionPayoff: ['title', 'desc', 'type', 'strike', 'premium', 'qty', 'spot', 'atExpiry', 'breakeven', 'maxLoss', 'note'],
    greeks: ['title', 'desc', 'type', 'spot', 'strike', 'vol', 'days', 'price', 'intrinsic', 'timeValue', 'note'],
  };
  for (const [demoId, fields] of Object.entries(stage6DemoKeys)) {
    fields.forEach((field) => check(`demo.${demoId}.${field}`));
  }
  [
    'options.eyebrow', 'options.title', 'options.subtitle', 'options.lockedTitle',
    'options.lockedText', 'options.lockedAction', 'options.chainTitle', 'options.chainSubtitle',
    'options.spotLabel', 'options.strike', 'options.call', 'options.put', 'options.delta',
    'options.selectCall', 'options.selectPut', 'options.chainNote', 'options.ticketTitle',
    'options.ticketSubtitle', 'options.contract', 'options.contracts', 'options.contractSize',
    'options.cashAvailable', 'options.feeNote', 'options.premium', 'options.totalCost',
    'options.breakeven', 'options.ticketBreakeven', 'options.buyButton', 'options.expiryIn',
    'options.expiryOption', 'options.avgPremium', 'options.currentValue', 'options.pnl',
    'options.daysLeft', 'options.daysLeftValue', 'options.close', 'options.noPositions',
    'options.positionsTitle', 'options.positionsSubtitle', 'options.expiryShort',
    'options.gamma', 'options.theta', 'options.noContract', 'options.educationTitle',
    'options.educationText',
    'options.buyMode', 'options.sellMode', 'options.sellButton', 'options.netCredit',
    'options.collateral', 'options.coveredShares', 'options.longPosition', 'options.shortPosition',
    'options.sellLockedHint',
    'strategies.locked', 'strategies.lockedAction',
    'toast.optionBought', 'toast.optionClosed', 'toast.optionSettled',
    'error.optionsLocked', 'error.contractNotFound', 'error.noOptionPosition',
    'error.insufficientContracts',
    'demo.strategyPayoff.title', 'demo.strategyPayoff.desc', 'demo.strategyPayoff.ticker',
    'demo.strategyPayoff.strategy', 'demo.strategyPayoff.expiry', 'demo.strategyPayoff.qty',
    'demo.strategyPayoff.netCost', 'demo.strategyPayoff.maxLoss', 'demo.strategyPayoff.maxProfit',
    'demo.strategyPayoff.unlimited', 'demo.strategyPayoff.unavailable', 'demo.strategyPayoff.note',
    'strategies.title', 'strategies.subtitle', 'strategies.qty', 'strategies.maxLoss',
    'strategies.note',
    'error.insufficientOptionCollateral', 'error.needCoveredShares', 'error.optionIsShort',
    'error.optionIsLong', 'error.optionsSellLocked', 'toast.optionSold', 'toast.strategyOpened',
  ].forEach((key) => check(key));
  for (const strategy of ['coveredCall', 'cashSecuredPut', 'bullCallSpread', 'bearPutSpread', 'longStraddle', 'longStrangle']) {
    ['name', 'desc', 'risk'].forEach((field) => check(`strategies.${strategy}.${field}`));
  }
  const stage8DemoKeys = {
    futuresPnl: ['title', 'desc', 'side', 'entry', 'exit', 'qty', 'notional', 'margin', 'pnl', 'return', 'note'],
    hedge: ['title', 'desc', 'shares', 'stockPrice', 'ratio', 'futuresPrice', 'stockValue', 'contracts', 'residual', 'note'],
    stressTest: ['title', 'desc', 'equity', 'leverage', 'shock', 'loss', 'remaining', 'status', 'survive', 'wipeout', 'note'],
  };
  for (const [demoId, fields] of Object.entries(stage8DemoKeys)) {
    fields.forEach((field) => check(`demo.${demoId}.${field}`));
  }
  [
    'nav.futures',
    'futures.eyebrow', 'futures.title', 'futures.subtitle', 'futures.lockedTitle',
    'futures.lockedText', 'futures.lockedAction', 'futures.chainTitle', 'futures.chainSubtitle',
    'futures.spotLabel', 'futures.expiry', 'futures.price', 'futures.basis', 'futures.marginPer',
    'futures.chainNote', 'futures.ticketTitle', 'futures.ticketSubtitle', 'futures.long',
    'futures.short', 'futures.contracts', 'futures.cashAvailable', 'futures.notional',
    'futures.marginRequired', 'futures.openButton', 'futures.feeNote', 'futures.positionsTitle',
    'futures.positionsSubtitle', 'futures.contract', 'futures.entry', 'futures.current',
    'futures.pnl', 'futures.margin', 'futures.close', 'futures.noPositions',
    'futures.educationTitle', 'futures.educationText', 'futures.noContract',
    'error.futuresLocked', 'error.insufficientFuturesMargin', 'error.noFuturesPosition',
    'toast.futureOpened', 'toast.futureClosed', 'toast.futuresVariation', 'toast.futuresSettled',
  ].forEach((key) => check(key));
  for (const unit of ALL_UNITS.filter((entry) => entry.implemented)) {
    check(`practice.${unit.id}.title`);
    check(`practice.${unit.id}.requirement`);
    check(`practice.${unit.id}.hint`);
    check(`practice.${unit.id}.action`);
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('UI key coverage');

test('shell, navigation and common actions are localised', () => {
  const { check, missing } = required();
  [
    'app.name', 'app.tagline',
    'nav.dashboard', 'nav.academy', 'nav.market', 'nav.trading', 'nav.portfolio',
    'nav.news', 'nav.options', 'nav.challenges', 'nav.glossary', 'nav.settings',
    'shell.level', 'shell.equity', 'shell.today', 'shell.marketTape', 'shell.stageOneBadge',
    'shell.disclaimer', 'clock.day', 'clock.pause', 'clock.play', 'clock.nextDay',
    'clock.speedPaused',
    'common.close', 'common.cancel', 'common.confirm', 'common.previous', 'common.next',
    'common.review', 'common.open', 'common.viewAll', 'common.today', 'common.gotIt',
    'common.locked',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('dashboard and academy views are localised', () => {
  const { check, missing } = required();
  [
    'dashboard.eyebrow', 'dashboard.greetingMorning', 'dashboard.greetingAfternoon',
    'dashboard.greetingEvening', 'dashboard.subtitle', 'dashboard.continueEyebrow',
    'dashboard.unitPill', 'dashboard.sectionsRead', 'dashboard.practiceDone',
    'dashboard.practicePending', 'dashboard.quizPassed', 'dashboard.quizPending',
    'dashboard.resumeLesson', 'dashboard.goPractice', 'dashboard.openAcademy',
    'dashboard.stageCompleteEyebrow', 'dashboard.stageCompleteTitle', 'dashboard.stageCompleteText',
    'settings.scope.p1g', 'settings.scope.p1h', 'settings.scope.p1i', 'settings.scope.p1j',
    'dashboard.certificateBadge', 'dashboard.stageUnits', 'dashboard.reviewAcademy',
    'dashboard.seeRoadmap', 'dashboard.certificateNote', 'dashboard.portfolioEyebrow',
    'dashboard.sinceStart', 'dashboard.cashLine', 'dashboard.positionsLine',
    'dashboard.marketPulse', 'dashboard.marketPulseSubtitle', 'dashboard.indexLabel',
    'dashboard.gainers', 'dashboard.losers', 'dashboard.statCash', 'dashboard.statCashSub',
    'dashboard.statHoldings', 'dashboard.statHoldingsSub', 'dashboard.statUnrealized',
    'dashboard.statUnrealizedSub', 'dashboard.statLevel', 'dashboard.statLevelSub',
    'dashboard.pathTitle', 'dashboard.pathSubtitle', 'dashboard.unitMeta',
    'dashboard.activityTitle', 'dashboard.activitySubtitle', 'dashboard.tradeMeta',
    'dashboard.noTradesTitle', 'dashboard.noTradesText', 'dashboard.goTrade',
    'dashboard.achievementsTitle', 'dashboard.achievementsSubtitle', 'dashboard.noAchievements',
    'academy.eyebrow', 'academy.title', 'academy.subtitle', 'academy.roadmap',
    'academy.review', 'academy.continue', 'academy.start', 'academy.quiz', 'academy.testOut',
    'academy.completed', 'academy.minutes', 'academy.lockedByUnit', 'academy.checkSections',
    'academy.checkPractice', 'academy.checkQuiz', 'academy.phaseBadge', 'academy.stageProgress',
    'academy.stages', 'academy.stageOneDoneTitle', 'academy.stageOneDoneText',
    'academy.stageOneDoneNote', 'academy.whatsNext', 'academy.notBuilt', 'academy.notBuiltText',
    'academy.unitUnavailable', 'academy.unitUnavailableText', 'academy.unitPlannedText',
    'academy.overall', 'academy.overallMeta',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('lesson and practice views are localised', () => {
  const { check, missing } = required();
  [
    'lesson.proTag', 'lesson.eyebrow', 'lesson.unitNumber', 'lesson.sectionOf',
    'lesson.sectionEyebrow', 'lesson.xpPerSection', 'lesson.read', 'lesson.outline',
    'lesson.practiceLink', 'lesson.quizLink', 'lesson.progress', 'lesson.progressMeta',
    'lesson.keyTerms', 'lesson.howItWorks', 'lesson.howLearn', 'lesson.howDemo',
    'lesson.howPractice', 'lesson.howTest', 'lesson.tipLabel', 'lesson.tipText',
    'lesson.backToAcademy', 'lesson.backToUnit', 'lesson.unlocks', 'lesson.unlockNote',
    'lesson.unitMeta', 'lesson.whatYouLearn', 'lesson.practiceTitle', 'lesson.goPractice',
    'lesson.markNext', 'lesson.completeSection', 'lesson.lockedTitle', 'lesson.lockedPrereq',
    'practice.eyebrow', 'practice.title', 'practice.done', 'practice.notDone', 'practice.open',
    'practice.progress', 'practice.autoHint', 'practice.restingLabel', 'practice.restingText',
    'practice.hintLabel', 'practice.verifyTitle', 'practice.verifyAuto', 'practice.verifyNoButton',
    'practice.verifyAccount', 'practice.unitStatus', 'practice.rewardLabel', 'practice.rewardText',
    'practice.goQuiz', 'practice.lockedText',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('market, trading and portfolio views are localised', () => {
  const { check, missing } = required();
  [
    'market.eyebrow', 'market.title', 'market.subtitle', 'market.practiceTitle',
    'market.practiceText', 'market.practiceLink', 'market.indexName', 'market.indexNote',
    'market.liveTitle', 'market.liveSubtitle', 'market.livePill', 'market.liveSetup',
    'market.liveSettings', 'market.liveRefresh', 'market.liveStatusIdle',
    'market.liveStatusLoading', 'market.liveStatusReady', 'market.liveUpdated',
    'market.liveCount', 'market.liveTicker', 'market.liveLast', 'market.liveChange',
    'market.liveNote',
    'market.searchPlaceholder', 'market.allSectors', 'market.companiesTitle',
    'market.companiesSubtitle', 'market.company', 'market.sector', 'market.last',
    'market.change', 'market.marketCap', 'market.spread', 'market.trend', 'market.inspect',
    'market.noResults', 'market.disclaimer', 'market.virtualCompany', 'market.bid',
    'market.ask', 'market.dayRange', 'market.volume',
    'trade.eyebrow', 'trade.chartTitle', 'trade.chartSubtitle', 'trade.chartRange',
    'trade.chartDaily', 'trade.chartIntraday', 'trade.chartTitleIntraday',
    'trade.chartSubtitleIntraday', 'trade.intradayNote',
    'trade.avgCostLine', 'trade.candleNote', 'trade.orderTicket', 'trade.orderTicketSubtitle',
    'trade.buy', 'trade.sell', 'trade.orderType', 'trade.marketOrder', 'trade.limitOrder',
    'trade.quantity', 'trade.max', 'trade.buyingPower', 'trade.sellable', 'trade.limitPrice',
    'trade.limitLocked', 'trade.estimatePrice', 'trade.estimateGross', 'trade.commission',
    'trade.estimateTotal', 'trade.estimateNet', 'trade.afterPower', 'trade.estimateNoteMarket',
    'trade.estimateNoteLimit', 'trade.feeNote', 'trade.submitBuy', 'trade.submitSell',
    'trade.explain.buy.market', 'trade.explain.buy.limit', 'trade.explain.sell.market',
    'trade.explain.sell.limit', 'trade.explain.always', 'trade.reservedCash', 'trade.spreadCost',
    'trade.companyTitle', 'trade.companySubtitle', 'trade.sharesOutstanding', 'trade.revenue',
    'trade.netIncome', 'trade.eps', 'trade.pe', 'trade.pb', 'trade.fundamentalsLocked',
    'trade.unlockStage3', 'trade.ordersTitle', 'trade.ordersSubtitle', 'trade.side',
    'trade.status', 'trade.fillPrice', 'trade.placed', 'trade.cancel', 'trade.noOrders',
    'trade.tradesTitle', 'trade.tradesSubtitle', 'trade.ticker', 'trade.price', 'trade.fee',
    'trade.realized', 'trade.date', 'trade.noTrades', 'trade.positionLabel',
    'trade.positionValue', 'trade.positionPnl', 'trade.avgCostMarker', 'trade.tipLabel',
    'trade.tipText', 'trade.unknownTicker', 'trade.validation.qty', 'trade.validation.limit',
    'trade.validation.cash', 'trade.validation.shares',
    'order.status.open', 'order.status.filled', 'order.status.cancelled', 'order.status.rejected',
    'portfolio.eyebrow', 'portfolio.title', 'portfolio.subtitle', 'portfolio.equity',
    'portfolio.equitySub', 'portfolio.cash', 'portfolio.cashSub', 'portfolio.holdingsValue',
    'portfolio.holdingsSub', 'portfolio.unrealized', 'portfolio.unrealizedSub',
    'portfolio.realized', 'portfolio.realizedSub', 'portfolio.return', 'portfolio.allocationTitle',
    'portfolio.allocationSubtitle', 'portfolio.noAllocation', 'portfolio.sectorTitle',
    'portfolio.holdingsTitle', 'portfolio.holdingsCount', 'portfolio.qty', 'portfolio.avgCost',
    'portfolio.value', 'portfolio.weight', 'portfolio.pnl', 'portfolio.trade',
    'portfolio.emptyTitle', 'portfolio.emptyText', 'portfolio.browseMarket',
    'portfolio.equityCurveTitle', 'portfolio.equityCurveSubtitle', 'portfolio.equityCurveNote',
    'portfolio.tradesTitle', 'portfolio.tradesSubtitle', 'portfolio.noTrades', 'portfolio.startLabel',
    'portfolio.riskTitle', 'portfolio.riskSubtitle', 'portfolio.volatility', 'portfolio.drawdown',
    'portfolio.exposure', 'portfolio.topWeight', 'portfolio.concentration',
    'portfolio.riskNoHistory', 'portfolio.riskNote',
    'portfolio.marginDebt', 'portfolio.financingPaid', 'portfolio.marginCalls',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('news, glossary, settings, roadmap and locked pages are localised', () => {
  const { check, missing } = required();
  [
    'onboarding.eyebrow', 'onboarding.title', 'onboarding.intro', 'onboarding.languageTitle',
    'onboarding.languageZhNote', 'onboarding.languageEnNote', 'onboarding.point1',
    'onboarding.point2', 'onboarding.point3', 'onboarding.start', 'onboarding.note',
    'news.eyebrow', 'news.title', 'news.subtitle', 'news.emptyTitle', 'news.emptyText',
    'news.disclaimer',
    'glossary.eyebrow', 'glossary.title', 'glossary.subtitle', 'glossary.searchPlaceholder',
    'glossary.twoLanguages', 'glossary.noResults', 'glossary.disclaimer', 'glossary.example',
    'glossary.related', 'glossary.openLesson', 'glossary.termTitle', 'glossary.open',
    'glossary.lesson', 'glossary.zhVersion', 'glossary.enVersion',
    'settings.eyebrow', 'settings.title', 'settings.subtitle', 'settings.languageTitle',
    'settings.languageSubtitle', 'settings.languageZhNote', 'settings.languageEnNote',
    'settings.languageHint', 'settings.simulationTitle', 'settings.simulationSubtitle',
    'settings.speed', 'settings.layoutTitle', 'settings.layoutHint', 'settings.beginner',
    'settings.advanced', 'settings.themeTitle', 'settings.themeDark', 'settings.themeLight',
    'settings.themeHint', 'settings.reducedMotion', 'settings.reducedMotionHint',
    'settings.liveTitle', 'settings.liveSubtitle', 'settings.liveUrlLabel',
    'settings.liveUrlPlaceholder', 'settings.liveIntervalLabel', 'settings.liveIntervalOption',
    'settings.liveSave', 'settings.liveHint', 'settings.liveSchema',
    'settings.dataTitle', 'settings.dataSubtitle', 'settings.saveStatus', 'settings.lastSaved',
    'settings.notSavedYet', 'settings.saveNow', 'settings.exportSave', 'settings.importSave',
    'settings.resetProgress', 'settings.dataHint', 'settings.scopeTitle', 'settings.scopeSubtitle',
    'settings.scopeText', 'settings.scopeIncluded', 'settings.scopePlanned',
    'settings.scope.p1a', 'settings.scope.p1b', 'settings.scope.p1c', 'settings.scope.p1d',
    'settings.scope.p1e', 'settings.scope.p1f', 'settings.scope.p1k',
    'settings.scope.future.a', 'settings.scope.future.b', 'settings.scope.future.c',
    'settings.disclaimer', 'settings.resetTitle',
    'settings.resetMessage', 'settings.resetConfirm',
    'roadmap.eyebrow', 'roadmap.title', 'roadmap.subtitle', 'roadmap.statusShipped',
    'roadmap.statusPlanned', 'roadmap.note',
    'roadmap.p1.title', 'roadmap.p1.text', 'roadmap.p1.i1', 'roadmap.p1.i2', 'roadmap.p1.i3',
    'roadmap.p1.i4', 'roadmap.p1.i5',
    'roadmap.p2.title', 'roadmap.p2.text', 'roadmap.p2.i1', 'roadmap.p2.i2', 'roadmap.p2.i3',
    'roadmap.p2.i4',
    'roadmap.p3.title', 'roadmap.p3.text', 'roadmap.p3.i1', 'roadmap.p3.i2', 'roadmap.p3.i3',
    'roadmap.p4.title', 'roadmap.p4.text', 'roadmap.p4.i1', 'roadmap.p4.i2', 'roadmap.p4.i3',
    'roadmap.p4.i4',
    'roadmap.p5.title', 'roadmap.p5.text', 'roadmap.p5.i1', 'roadmap.p5.i2', 'roadmap.p5.i3',
    'roadmap.p6.title', 'roadmap.p6.text', 'roadmap.p6.i1', 'roadmap.p6.i2', 'roadmap.p6.i3',
    'roadmap.p6.i4',
    'roadmap.p7.title', 'roadmap.p7.text', 'roadmap.p7.i1', 'roadmap.p7.i2', 'roadmap.p7.i3',
    'roadmap.p7.i4',
    'roadmap.p8.title', 'roadmap.p8.text', 'roadmap.p8.i1', 'roadmap.p8.i2', 'roadmap.p8.i3',
    'roadmap.p8.i4',
    'roadmap.p9.title', 'roadmap.p9.text', 'roadmap.p9.i1', 'roadmap.p9.i2', 'roadmap.p9.i3',
    'roadmap.p9.i4',
    'roadmap.p10.title', 'roadmap.p10.text', 'roadmap.p10.i1', 'roadmap.p10.i2',
    'roadmap.p10.i3', 'roadmap.p10.i4',
    'roadmap.p11.title', 'roadmap.p11.text', 'roadmap.p11.i1', 'roadmap.p11.i2',
    'roadmap.p11.i3', 'roadmap.p11.i4',
    'roadmap.p12.title', 'roadmap.p12.text', 'roadmap.p12.i1', 'roadmap.p12.i2',
    'roadmap.p12.i3', 'roadmap.p12.i4',
    'roadmap.p13.title', 'roadmap.p13.text', 'roadmap.p13.i1', 'roadmap.p13.i2',
    'roadmap.p13.i3', 'roadmap.p13.i4',
    'roadmap.p14.title', 'roadmap.p14.text', 'roadmap.p14.i1', 'roadmap.p14.i2',
    'roadmap.p14.i3', 'roadmap.p14.i4',
    'locked.eyebrow', 'locked.subtitle', 'locked.options.title', 'locked.options.text',
    'locked.options.i1', 'locked.options.i2', 'locked.options.i3', 'locked.options.i4',
    'locked.challenges.title', 'locked.challenges.text', 'locked.challenges.i1',
    'locked.challenges.i2', 'locked.challenges.i3', 'locked.notAvailable',
    'locked.notAvailableText', 'locked.backToAcademy',
    'unlock.category.market', 'unlock.category.trading', 'unlock.category.options',
    'unlock.category.futures',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('UK tax copy');

test('tax lab labels, warnings, limitations and sources are localised', () => {
  const { check, missing } = required();
  check('nav.tax');
  [
    'tax.eyebrow', 'tax.title', 'tax.subtitle', 'tax.formTitle', 'tax.formSubtitle',
    'tax.accountType', 'tax.gia', 'tax.isaOption', 'tax.incomeBand',
    'tax.bandBasic', 'tax.bandHigher', 'tax.bandAdditional',
    'tax.taxableIncome', 'tax.taxableIncomeHint', 'tax.fxRate', 'tax.fxRateHint',
    'tax.isaContributions', 'tax.isaHint', 'tax.ukShares', 'tax.ukSharesHint',
    'tax.recalculate', 'tax.estimateBadge',
    'tax.cgt', 'tax.cgtSub', 'tax.dividendTax', 'tax.dividendTaxSub',
    'tax.sdrt', 'tax.sdrtSub', 'tax.totalTax', 'tax.totalTaxSub',
    'tax.cgtTitle', 'tax.cgtSubtitle', 'tax.grossProceeds', 'tax.allowableCosts',
    'tax.gains', 'tax.losses', 'tax.netGain', 'tax.aea', 'tax.taxableGain',
    'tax.cgtDue', 'tax.basicSlice', 'tax.higherSlice',
    'tax.disposalsTitle', 'tax.disposalsSubtitle', 'tax.noDisposals',
    'tax.date', 'tax.ticker', 'tax.quantity', 'tax.proceeds', 'tax.costBasis',
    'tax.gain', 'tax.matching', 'tax.matchDetail',
    'tax.dividendsTitle', 'tax.dividendsSubtitle', 'tax.dividendGross',
    'tax.dividendAllowance', 'tax.dividendTaxable', 'tax.dividendBasic',
    'tax.dividendHigher', 'tax.dividendAdditional', 'tax.dividendTaxDue',
    'tax.dividendAmount', 'tax.noDividends',
    'tax.isaTitle', 'tax.isaNote', 'tax.isaExempt', 'tax.isaAllowance',
    'tax.isaUsed', 'tax.isaRemaining', 'tax.isaExcess',
    'tax.warningTitle', 'tax.warning.poolMismatch', 'tax.warning.excludedTrades',
    'tax.warning.isaExcess',
    'tax.aboutTitle', 'tax.aboutSubtitle', 'tax.disclaimer',
    'tax.limitation.estimateOnly', 'tax.limitation.simulatedPrices',
    'tax.limitation.fixedFxRate', 'tax.limitation.sameDayFifo',
    'tax.limitation.tradeLogLimit', 'tax.limitation.dividendLogLimit',
    'tax.limitation.excludedAssets',
    'tax.source.cgt', 'tax.source.shares', 'tax.source.dividends',
    'tax.source.isa', 'tax.source.sdrt',
    'tax.empty', 'tax.errorTitle', 'tax.errorHint',
    'error.ukTaxYear', 'error.ukTaxAccount', 'error.ukTaxIncome', 'error.ukTaxFx',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Career mode copy');

test('career rank names, requirements and salary UI are localised', () => {
  const { check, missing } = required();
  check('nav.career');
  [
    'career.eyebrow', 'career.title', 'career.subtitle', 'career.note',
    'career.currentTitle', 'career.currentRank', 'career.rankLabel',
    'career.salaryLabel', 'career.salaryValue', 'career.noSalary', 'career.noSalarySub',
    'career.salaryIn', 'career.careerIncome', 'career.careerIncomeSub',
    'career.xpLabel', 'career.xpSub', 'career.nextRankLabel', 'career.current',
    'career.achieved', 'career.locked', 'career.ladderTitle', 'career.ladderSubtitle',
    'career.promote', 'career.promoteHint', 'career.currentNote', 'career.maxRank',
    'career.maxRankReached', 'career.maxRankText', 'career.progressValue',
    'career.progressMoney', 'career.errorMaxRank', 'career.errorNotReady',
    'career.req.unit', 'career.req.units', 'career.req.trades', 'career.req.inspected',
    'career.req.demo', 'career.req.equity', 'career.req.options', 'career.req.futures',
    'career.req.challenge', 'career.req.challenges', 'career.req.branch',
    'career.req.branches', 'career.req.xp',
    'toast.careerPromoted', 'toast.careerSalary',
  ].forEach((key) => check(key));
  for (const rank of CAREER_RANKS) {
    check(`career.rank.${rank.id}.title`);
    check(`career.rank.${rank.id}.desc`);
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Fund management copy');

test('fund management UI, roles, strategies and events are localised', () => {
  const { check, missing } = required();
  check('nav.fund');
  [
    'fund.eyebrow', 'fund.title', 'fund.subtitle', 'fund.note', 'fund.status.active',
    'fund.status.closed', 'fund.careerOnly', 'fund.careerOnlyNote', 'fund.lockedTitle',
    'fund.lockedText', 'fund.lockedHint', 'fund.goCareer', 'fund.setupTitle',
    'fund.setupSubtitle', 'fund.nameLabel', 'fund.namePlaceholder', 'fund.strategyLabel',
    'fund.riskLabel', 'fund.aumLabel', 'fund.managementFeeLabel', 'fund.managementFeeOption',
    'fund.performanceFeeLabel', 'fund.performanceFeeOption', 'fund.create', 'fund.setupNote',
    'fund.errorCareerOnly', 'fund.errorLocked', 'fund.errorAlreadyActive', 'fund.errorName',
    'fund.errorNotActive', 'fund.errorPositionCap', 'fund.errorCashFloor', 'fund.errorNoNav',
    'fund.errorUnknownRole', 'fund.errorRoleFilled', 'fund.errorCannotAfford',
    'fund.errorNoEmployee', 'fund.errorNoCandidate', 'fund.errorNoRedemption',
    'fund.errorRedemptionCash', 'fund.errorNoCompanyCash', 'fund.errorResearchHistory',
    'fund.errorOptimizerHistory', 'fund.errorOptimizerEmpty',
    'fund.stats.aum', 'fund.stats.aumSub', 'fund.stats.navPerUnit', 'fund.stats.navSub',
    'fund.stats.totalReturn', 'fund.stats.vsBenchmark', 'fund.stats.drawdown',
    'fund.stats.drawdownSub', 'fund.stats.cashRatio', 'fund.stats.cashSub',
    'fund.stats.companyCash', 'fund.stats.companyCashSub', 'fund.stats.managementFees',
    'fund.stats.feeSub', 'fund.stats.performanceFees', 'fund.stats.hwmSub',
    'fund.chart.title', 'fund.chart.subtitle', 'fund.chart.note',
    'fund.risk.title', 'fund.risk.subtitle', 'fund.risk.cash', 'fund.risk.minCash',
    'fund.risk.topPosition', 'fund.risk.maxPosition', 'fund.risk.noPosition',
    'fund.risk.drawdown', 'fund.risk.maxDrawdown', 'fund.risk.benchmark', 'fund.risk.alpha',
    'fund.risk.warning', 'fund.risk.healthy', 'fund.risk.days', 'fund.risk.breach', 'fund.risk.ok',
    'fund.trade.title', 'fund.trade.subtitle', 'fund.trade.cash', 'fund.trade.ticker',
    'fund.trade.qty', 'fund.trade.buy', 'fund.trade.sell', 'fund.trade.quote',
    'fund.trade.maxBuy', 'fund.trade.avgCost', 'fund.trade.value', 'fund.trade.pnl',
    'fund.trade.weight', 'fund.trade.noPositions', 'fund.trade.note',
    'fund.clients.title', 'fund.clients.subtitle', 'fund.clients.cash', 'fund.clients.name',
    'fund.clients.value', 'fund.clients.risk', 'fund.clients.trust', 'fund.clients.status',
    'fund.clients.action', 'fund.clients.requestPending', 'fund.clients.active',
    'fund.clients.settle', 'fund.clients.none', 'fund.clients.candidates',
    'fund.clients.principal', 'fund.clients.accept', 'fund.clients.noCandidates',
    'fund.clients.note',
    'fund.team.title', 'fund.team.subtitle', 'fund.team.payroll', 'fund.team.hired',
    'fund.team.open', 'fund.team.salary', 'fund.team.skill', 'fund.team.hire', 'fund.team.fire',
    'fund.team.note',
    'fund.ops.title', 'fund.ops.subtitle', 'fund.ops.managementRate', 'fund.ops.perYear',
    'fund.ops.performanceRate', 'fund.ops.hwm', 'fund.ops.nextFee', 'fund.ops.inDays',
    'fund.ops.payrollDue', 'fund.ops.feePayable', 'fund.ops.companyCash', 'fund.ops.withdrawn',
    'fund.ops.withdraw', 'fund.ops.note',
    'fund.leaderboard.title', 'fund.leaderboard.subtitle', 'fund.leaderboard.fund',
    'fund.leaderboard.return', 'fund.leaderboard.aum', 'fund.leaderboard.you',
    'fund.leaderboard.note',
    'fund.insights.title', 'fund.insights.subtitle', 'fund.insights.empty',
    'fund.insight.research', 'fund.insight.quant', 'fund.insight.macro', 'fund.insight.risk',
    'fund.plan.title', 'fund.plan.subtitle', 'fund.plan.enabled', 'fund.plan.disabled',
    'fund.plan.enableLabel', 'fund.plan.off', 'fund.plan.on', 'fund.plan.strategyLabel',
    'fund.plan.topNLabel', 'fund.plan.intervalLabel', 'fund.plan.autoLabel',
    'fund.plan.cashBufferLabel',
    'fund.plan.generate', 'fund.plan.hint', 'fund.plan.strategyHint', 'fund.plan.generated',
    'fund.plan.lastAuto', 'fund.plan.autoDisabledHint', 'fund.plan.nav', 'fund.plan.cashAfter',
    'fund.plan.cost', 'fund.plan.costPct', 'fund.plan.costBreakdown', 'fund.plan.side', 'fund.plan.ticker',
    'fund.plan.qty', 'fund.plan.price', 'fund.plan.reason', 'fund.plan.apply',
    'fund.plan.aligned', 'fund.plan.noPlan', 'fund.plan.errorEmpty',
    'fund.plan.reasonKey.rebalance', 'fund.plan.reasonKey.signalBuy', 'fund.plan.reasonKey.momentum',
    'fund.plan.reasonKey.optimizer', 'fund.plan.reasonKey.optimizerExit',
    'fund.research.title', 'fund.research.subtitle', 'fund.research.run',
    'fund.research.combo', 'fund.research.note', 'fund.research.empty',
    'fund.research.window', 'fund.research.split', 'fund.research.overfitWarning',
    'fund.research.overfitClear', 'fund.research.bestTitle', 'fund.research.best',
    'fund.research.baseline', 'fund.research.config', 'fund.research.intervalShort',
    'fund.research.inReturn', 'fund.research.inSharpe', 'fund.research.outReturn',
    'fund.research.outSharpe', 'fund.research.outDrawdown', 'fund.research.score',
    'fund.research.topN', 'fund.research.cash', 'fund.research.interval',
    'fund.research.candidatesTitle', 'fund.research.candidatesSubtitle',
    'fund.research.apply', 'fund.research.applyNote', 'fund.research.disclaimer',
    'fund.optimizer.title', 'fund.optimizer.subtitle', 'fund.optimizer.pill',
    'fund.optimizer.methodLabel', 'fund.optimizer.minVariance', 'fund.optimizer.minVarianceDesc',
    'fund.optimizer.riskParity', 'fund.optimizer.riskParityDesc', 'fund.optimizer.meanVariance',
    'fund.optimizer.meanVarianceDesc', 'fund.optimizer.lookbackLabel', 'fund.optimizer.maxWeightLabel',
    'fund.optimizer.cashBufferLabel', 'fund.optimizer.run', 'fund.optimizer.note',
    'fund.optimizer.empty', 'fund.optimizer.expectedReturn', 'fund.optimizer.expectedVol',
    'fund.optimizer.equalVol', 'fund.optimizer.cashWeight', 'fund.optimizer.tableTitle',
    'fund.optimizer.ticker', 'fund.optimizer.sector', 'fund.optimizer.weight',
    'fund.optimizer.assetReturn', 'fund.optimizer.assetVol', 'fund.optimizer.apply',
    'fund.optimizer.applyNote', 'fund.optimizer.disclaimer',
    'fund.riskModel.title', 'fund.riskModel.subtitle', 'fund.riskModel.pill',
    'fund.riskModel.empty', 'fund.riskModel.history', 'fund.riskModel.totalRisk',
    'fund.riskModel.factorRisk', 'fund.riskModel.specificRisk', 'fund.riskModel.invested',
    'fund.riskModel.factorTitle', 'fund.riskModel.factor', 'fund.riskModel.exposure',
    'fund.riskModel.contribution', 'fund.riskModel.specific', 'fund.riskModel.market',
    'fund.riskModel.size', 'fund.riskModel.value', 'fund.riskModel.momentum',
    'fund.riskModel.lowVol', 'fund.riskModel.stressTitle', 'fund.riskModel.scenario',
    'fund.riskModel.shock', 'fund.riskModel.impact', 'fund.riskModel.marketDown',
    'fund.riskModel.momentumDown', 'fund.riskModel.valueDown', 'fund.riskModel.volSpike',
    'fund.riskModel.note', 'fund.riskModel.disclaimer',
    'fund.taxLabel', 'fund.taxProfile.none', 'fund.taxProfile.noneDesc',
    'fund.taxProfile.flat15', 'fund.taxProfile.flat15Desc',
    'fund.taxProfile.flat25Levy', 'fund.taxProfile.flat25LevyDesc',
    'fund.ops.taxProfile', 'fund.ops.taxesPaid',
    'fund.attr.title', 'fund.attr.subtitle', 'fund.attr.total', 'fund.attr.benchmark',
    'fund.attr.cashWeight', 'fund.attr.component', 'fund.attr.contribution',
    'fund.attr.market', 'fund.attr.sector', 'fund.attr.cash', 'fund.attr.fees',
    'fund.attr.selection', 'fund.attr.sectorTitle', 'fund.attr.sectorHeader',
    'fund.attr.portfolioWeight',
    'fund.attr.benchmarkWeight', 'fund.attr.sectorReturn',
    'fund.attr.exposureTitle', 'fund.attr.betaExposure', 'fund.attr.momentumExposure',
    'fund.attr.volExposure', 'fund.attr.peExposure', 'fund.attr.positionsTitle',
    'fund.attr.positionTicker', 'fund.attr.positionWeight', 'fund.attr.positionReturn',
    'fund.attr.positionContribution', 'fund.attr.positionsNote', 'fund.attr.note',
    'fund.events.title', 'fund.events.subtitle', 'fund.events.empty',
    'fund.close.title', 'fund.close.finalAum', 'fund.close.finalReturn',
    'fund.close.finalDrawdown', 'fund.close.note',
    'toast.fundCreated', 'toast.fundHired', 'toast.fundFired', 'toast.fundClientJoined',
    'toast.fundRedemptionPaid', 'toast.fundCashWithdrawn', 'toast.fundRedemptionRequest',
    'toast.fundPayrollShort', 'toast.fundClosed', 'toast.fundPlanApplied',
    'toast.fundAutoRebalance', 'toast.fundResearchApplied', 'toast.fundOptimizerPlan',
    'toast.liveFeedSaved',
  ].forEach((key) => check(key));
  for (const strategy of Object.values(FUND_STRATEGIES)) {
    check(strategy.nameKey);
    check(strategy.descKey);
  }
  for (const risk of Object.values(FUND_RISK_PROFILES)) check(risk.nameKey);
  for (const role of FUND_ROLES) {
    check(role.nameKey);
    check(role.descKey);
  }
  ['pension', 'endowment', 'familyOffice', 'insurance', 'fundOfFunds', 'privateClient', 'trust', 'foundation']
    .forEach((type) => check(`fund.clientType.${type}`));
  ['low', 'medium', 'high'].forEach((risk) => check(`fund.clientRisk.${risk}`));
  ['northstar', 'quantedge', 'macroline', 'cedarrock', 'steady'].forEach((peer) => check(`fund.peer.${peer}`));
  ['drawdown', 'liquidity', 'payroll', 'risk', 'redeemed'].forEach((reason) => check(`fund.closeReason.${reason}`));
  ['buy', 'hold', 'avoid'].forEach((rating) => check(`fund.rating.${rating}`));
  ['created', 'subscription', 'redemption', 'redemptionRequest', 'dividend', 'managementFee',
    'performanceFee', 'payroll', 'payrollShort', 'candidate', 'closed', 'other']
    .forEach((event) => check(`fund.event.${event}`));
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Multi-asset copy');

test('bond and FX desks, positions, errors and toasts are localised', () => {
  const { check, missing } = required();
  [
    'nav.multiasset',
    'multiasset.eyebrow', 'multiasset.title', 'multiasset.subtitle', 'multiasset.pill',
    'multiasset.note', 'multiasset.lockedTitle', 'multiasset.lockedText',
    'multiasset.lockedHint', 'multiasset.goAcademy',
    'multiasset.bondValue', 'multiasset.fxValue', 'multiasset.commodityValue',
    'multiasset.cryptoValue', 'multiasset.cash',
    'multiasset.bondUnrealized', 'multiasset.fxUnrealized',
    'multiasset.commodityUnrealized', 'multiasset.cryptoUnrealized', 'multiasset.cashSub',
    'multiasset.bondTitle', 'multiasset.bondSubtitle', 'multiasset.bond',
    'multiasset.qty', 'multiasset.buyBond', 'multiasset.bondNote',
    'multiasset.bondPositionsTitle', 'multiasset.bondPositionsSubtitle',
    'multiasset.noBondPositions', 'multiasset.duration', 'multiasset.coupon',
    'multiasset.yield', 'multiasset.price', 'multiasset.avgCost', 'multiasset.value',
    'multiasset.pnl', 'multiasset.sellAll',
    'multiasset.fxTitle', 'multiasset.fxSubtitle', 'multiasset.pair', 'multiasset.units',
    'multiasset.buyFx', 'multiasset.fxNote', 'multiasset.fxPositionsTitle',
    'multiasset.fxPositionsSubtitle', 'multiasset.noFxPositions', 'multiasset.rate',
    'multiasset.change',
    'multiasset.commodityTitle', 'multiasset.commoditySubtitle', 'multiasset.commodity',
    'multiasset.buyCommodity', 'multiasset.commodityNote',
    'multiasset.commodityPositionsTitle', 'multiasset.commodityPositionsSubtitle',
    'multiasset.noCommodityPositions',
    'multiasset.cryptoTitle', 'multiasset.cryptoSubtitle', 'multiasset.crypto',
    'multiasset.buyCrypto', 'multiasset.cryptoNote',
    'multiasset.cryptoPositionsTitle', 'multiasset.cryptoPositionsSubtitle',
    'multiasset.noCryptoPositions',
    'toast.bondCoupons', 'toast.bondBought', 'toast.bondSold', 'toast.fxBought', 'toast.fxSold',
    'toast.commodityBought', 'toast.commoditySold', 'toast.cryptoBought', 'toast.cryptoSold',
  ].forEach((key) => check(key));
  ['gov', 'AA', 'A', 'BBB', 'BB'].forEach((rating) => check(`multiasset.rating.${rating}`));
  for (const bond of BOND_DEFS) {
    check(bond.nameKey);
    check(bond.issuerKey);
  }
  for (const pair of FX_PAIRS) check(pair.nameKey);
  for (const commodity of COMMODITY_DEFS) {
    check(commodity.nameKey);
    check(commodity.unitKey);
  }
  for (const asset of CRYPTO_DEFS) check(asset.nameKey);
  ['bond.errorUnknown', 'bond.errorNoPosition', 'bond.errorInsufficient',
    'fx.errorUnknown', 'fx.errorNoPosition', 'fx.errorInsufficient',
    'commodity.errorUnknown', 'commodity.errorNoPosition', 'commodity.errorInsufficient',
    'crypto.errorUnknown', 'crypto.errorNoPosition', 'crypto.errorQtyInvalid', 'crypto.errorInsufficient']
    .forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Macro world copy');

test('macro dashboard, calendar, regimes and regions are localised', () => {
  const { check, missing } = required();
  [
    'nav.macro',
    'macroPage.eyebrow', 'macroPage.title', 'macroPage.subtitle', 'macroPage.note',
    'macroPage.lockedTitle', 'macroPage.lockedText', 'macroPage.lockedHint', 'macroPage.goAcademy',
    'macroPage.policyRate', 'macroPage.inflation', 'macroPage.growth', 'macroPage.unemployment',
    'macroPage.realRate', 'macroPage.realRateSub', 'macroPage.confidence', 'macroPage.confidenceSub',
    'macroPage.riskAppetiteSub', 'macroPage.yieldCurve', 'macroPage.yieldSub',
    'macroPage.creditSpread', 'macroPage.creditSub', 'macroPage.regimeTitle',
    'macroPage.riskAppetite', 'macroPage.riskAppetiteLabel', 'macroPage.policyBias',
    'macroPage.easy', 'macroPage.tight', 'macroPage.neutralBias', 'macroPage.regimeNote',
    'macroPage.chartTitle', 'macroPage.chartSubtitle', 'macroPage.chartNote',
    'macroPage.calendarTitle', 'macroPage.calendarSubtitle', 'macroPage.date',
    'macroPage.eventLabel', 'macroPage.forecast', 'macroPage.actual', 'macroPage.surprise',
    'macroPage.impact', 'macroPage.status', 'macroPage.released', 'macroPage.upcoming',
    'macroPage.calendarNote', 'macroPage.calendarEmpty',
    'macroPage.globalTitle', 'macroPage.globalSubtitle', 'macroPage.regionLabel',
    'macroPage.level', 'macroPage.change', 'macroPage.coupling', 'macroPage.globalNote',
  ].forEach((key) => check(key));
  ['expansion', 'slowdown', 'inflation', 'neutral'].forEach((regime) => check(`macroPage.regime.${regime}`));
  ['cpi', 'payrolls', 'gdp', 'pmi', 'centralBank'].forEach((event) => check(`macroPage.event.${event}`));
  ['us', 'europe', 'asia', 'em'].forEach((region) => check(`macroPage.region.${region}`));
  ['expansion', 'slowdown', 'inflation', 'neutral'].forEach((regime) => check(`macro.regime.${regime}`));
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Quant Lab copy');

test('quant lab UI, strategies, parameters and factors are localised', () => {
  const { check, missing } = required();
  [
    'nav.quant',
    'quant.eyebrow', 'quant.title', 'quant.subtitle', 'quant.pill', 'quant.note',
    'quant.lockedTitle', 'quant.lockedText', 'quant.lockedHint', 'quant.goAcademy',
    'quant.configTitle', 'quant.configSubtitle', 'quant.tickerLabel', 'quant.strategyLabel',
    'quant.cashLabel', 'quant.commissionLabel', 'quant.factorLabel', 'quant.factorLookbackLabel',
    'quant.run', 'quant.runOptimize', 'quant.runRegression', 'quant.runMl',
    'quant.resultTitle', 'quant.objectiveLabel', 'quant.splitLabel',
    'quant.error.history', 'quant.error.optimizeHistory', 'quant.error.mlData',
    'quant.error.regression', 'quant.error.strategy',
    'quant.reg.lookbackLabel', 'quant.reg.horizonLabel', 'quant.reg.configSubtitle',
    'quant.reg.note', 'quant.reg.resultTitle', 'quant.reg.samples', 'quant.reg.dates',
    'quant.reg.r2', 'quant.reg.intercept', 'quant.reg.lookback', 'quant.reg.horizon',
    'quant.reg.tableTitle', 'quant.reg.tableSubtitle', 'quant.reg.factor',
    'quant.reg.coefficient', 'quant.reg.ic', 'quant.reg.disclaimer',
    'quant.opt.resultTitle', 'quant.opt.inSampleReturn', 'quant.opt.inSharpe',
    'quant.opt.outSampleReturn', 'quant.opt.outSharpe', 'quant.opt.outDrawdown',
    'quant.opt.split', 'quant.opt.baseline', 'quant.opt.pickCount',
    'quant.opt.overfitWarning', 'quant.opt.overfitClear',
    'quant.opt.bestTitle', 'quant.opt.bestSubtitle', 'quant.opt.bestNote',
    'quant.opt.tableTitle', 'quant.opt.tableSubtitle', 'quant.opt.params',
    'quant.opt.inReturn', 'quant.opt.score', 'quant.opt.chartTitle',
    'quant.opt.chartSubtitle', 'quant.opt.chartNote', 'quant.opt.disclaimer',
    'quant.opt.gridNote',
    'quant.ml.configSubtitle', 'quant.ml.configNote', 'quant.ml.resultTitle',
    'quant.ml.topReturn', 'quant.ml.benchmark', 'quant.ml.excess', 'quant.ml.hitRate',
    'quant.ml.testAccuracy', 'quant.ml.trainAccuracy', 'quant.ml.rebalances',
    'quant.ml.avgExcess', 'quant.ml.overfitWarning', 'quant.ml.overfitClear',
    'quant.ml.modelTitle', 'quant.ml.modelSubtitle', 'quant.ml.intercept',
    'quant.ml.modelLabel', 'quant.ml.modelType', 'quant.ml.modelLogistic',
    'quant.ml.modelMlp', 'quant.ml.modelDeep', 'quant.ml.hiddenUnits',
    'quant.ml.hiddenLayer1', 'quant.ml.hiddenLayer2', 'quant.ml.epochs',
    'quant.ml.featureImportance', 'quant.ml.autoTuneLabel', 'quant.ml.autoTuneOff',
    'quant.ml.autoTuneOn', 'quant.ml.tuningBest', 'quant.ml.tuningValidation',
    'quant.ml.tuningCandidates', 'quant.ml.tuningNote',
    'quant.ml.splitDate', 'quant.ml.modelNote', 'quant.ml.picksTitle',
    'quant.ml.picksSubtitle', 'quant.ml.date', 'quant.ml.picks',
    'quant.ml.pickReturn', 'quant.ml.universeReturn', 'quant.ml.chartTitle',
    'quant.ml.chartSubtitle', 'quant.ml.chartNote', 'quant.ml.disclaimer',
    'quant.ml.lookbackLabel', 'quant.ml.horizonLabel', 'quant.ml.topNLabel',
    'quant.ml.testPctLabel',
    'quant.stats.totalReturn', 'quant.stats.cagr', 'quant.stats.maxDrawdown',
    'quant.stats.finalEquity', 'quant.stats.sharpe', 'quant.stats.volatility',
    'quant.stats.winRate', 'quant.stats.trades', 'quant.stats.exposure',
    'quant.stats.openPosition', 'quant.stats.flat', 'quant.stats.benchmark',
    'quant.stats.excess',
    'quant.chartTitle', 'quant.chartSubtitle', 'quant.chartNote',
    'quant.tradesTitle', 'quant.tradesSubtitle', 'quant.tradesEmpty',
    'quant.trade.entry', 'quant.trade.exit', 'quant.trade.qty', 'quant.trade.pnl',
    'quant.trade.return', 'quant.trade.bars', 'quant.trade.stillOpen',
    'quant.disclaimer', 'quant.factorTitle', 'quant.factorSubtitle',
  ].forEach((key) => check(key));
  for (const strategy of Object.values(QUANT_STRATEGIES)) {
    check(strategy.nameKey);
    check(strategy.descKey);
    for (const definition of strategy.params) check(definition.labelKey);
  }
  for (const factor of QUANT_FACTOR_OPTIONS) {
    check(factor.nameKey);
    check(factor.descKey);
  }
  for (const mode of QUANT_MODES) {
    check(mode.nameKey);
    check(mode.descKey);
  }
  for (const objective of QUANT_OBJECTIVES) check(objective.nameKey);
  ['ticker', 'sector', 'metric', 'note', 'empty', 'news', 'newsDesc',
    'newsTrend', 'newsTrendDesc', 'volume', 'volumeDesc', 'flow', 'flowDesc',
    'analyst', 'analystDesc']
    .forEach((key) => check(`quant.factor.${key}`));
  for (const model of ML_MODELS) check(model.nameKey);
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Sandbox, challenges and boundaries');

test('sandbox, challenge and boundary copy exists in both languages', () => {
  const { check, missing } = required();
  [
    'nav.sandbox', 'nav.challenges', 'nav.branches',
    'sandbox.eyebrow', 'sandbox.title', 'sandbox.subtitle', 'sandbox.setupTitle',
    'sandbox.cashLabel', 'sandbox.seedLabel', 'sandbox.difficultyLabel', 'sandbox.start',
    'sandbox.exit', 'sandbox.restart', 'sandbox.modeBadge', 'sandbox.note',
    'sandbox.commission', 'sandbox.currentTitle', 'sandbox.activeNote',
    'sandbox.difficulty.easy', 'sandbox.difficulty.normal', 'sandbox.difficulty.hard',
    'challenges.eyebrow', 'challenges.title', 'challenges.subtitle', 'challenges.start',
    'challenges.abandon', 'challenges.activeTitle', 'challenges.noActiveTitle',
    'challenges.metric.return', 'challenges.metric.drawdownMax', 'challenges.metric.trades',
    'challenges.metric.optionTrades', 'challenges.metric.futuresTrades',
    'challenges.metric.hedge', 'challenges.metric.income', 'challenges.metric.volatility',
    'challenges.metric.allRound',
    'challenges.firstProfit.title', 'challenges.firstProfit.desc',
    'challenges.riskManager.title', 'challenges.riskManager.desc',
    'challenges.hedger.title', 'challenges.hedger.desc',
    'challenges.incomeDesk.title', 'challenges.incomeDesk.desc',
    'challenges.volatilityDesk.title', 'challenges.volatilityDesk.desc',
    'challenges.allRound.title', 'challenges.allRound.desc',
    'boundaries.eyebrow', 'boundaries.title', 'boundaries.subtitle', 'boundaries.intro',
    'boundaries.futures.title', 'boundaries.futures.body', 'boundaries.futures.detail',
    'boundaries.options.title', 'boundaries.options.body', 'boundaries.options.detail',
    'boundaries.history.title', 'boundaries.history.body', 'boundaries.history.detail',
    'boundaries.note', 'boundaries.settingsLink',
    'futures.boundaryTitle', 'futures.boundaryText',
    'options.boundaryTitle', 'options.boundaryText',
    'branches.title', 'branches.subtitle', 'branches.lockedTitle', 'branches.lockedText',
    'branch.asset.name', 'branch.asset.desc', 'branch.asset.career', 'branch.asset.outcome',
    'branch.quant.name', 'branch.derivatives.name', 'branch.banking.name',
    'branch.macro.name', 'branch.microstructure.name',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

test('error and toast messages are localised', () => {
  const { check, missing } = required();
  [
    'error.qtyInvalid', 'error.priceInvalid', 'error.insufficientCash', 'error.insufficientShares',
    'error.unknownTicker', 'error.sideInvalid', 'error.typeInvalid', 'error.unitUnavailable',
    'error.sectionUnknown', 'error.viewFailed', 'error.viewFailedText',
    'toast.welcome', 'toast.saveRestored', 'toast.saveIncompatible', 'toast.storageFallback',
    'toast.orderFilled', 'toast.orderPlaced', 'toast.orderCancelled', 'toast.limitFilled',
    'toast.saved', 'toast.saveFailed', 'toast.practiceComplete', 'toast.unitComplete',
    'toast.achievement', 'toast.toolUnlocked', 'toast.quizPassed', 'toast.quizFailed',
    'toast.exported', 'toast.importOk', 'toast.importInvalid',
    'toast.challengeStarted', 'toast.challengeCompleted', 'toast.challengeFailed',
    'toast.optionAssignedEarly', 'toast.liveFeedSaved',
    'liveFeed.errorEmpty', 'liveFeed.errorQuotes', 'liveFeed.errorUrl',
    'liveFeed.errorUnavailable', 'liveFeed.errorHttp', 'liveFeed.errorFetch',
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});

suite('Simulated exchange copy');

test('exchange controls, statuses and errors are localised', () => {
  const { check, missing } = required();
  check('nav.exchange');
  [
    'eyebrow', 'title', 'subtitle', 'simBadge', 'clockTitle', 'clockSubtitle', 'session',
    'play', 'pause', 'stepSecond', 'stepMinute', 'stepDay', 'save', 'reset', 'saved', 'saveFailed',
    'resetConfirm', 'resetDone', 'ticker', 'side', 'buy', 'sell', 'short', 'cover', 'qty', 'type', 'market',
    'limit', 'limitPrice', 'optional', 'submit', 'ticketNote', 'book', 'bookSubtitle',
    'ticket', 'ticketSubtitle', 'positions', 'orders', 'trades', 'empty', 'order', 'orderStatus',
    'filled', 'fee', 'fees', 'time', 'price', 'size', 'volume', 'bid', 'ask', 'fairValue',
    'equity', 'cash', 'realized', 'unrealized', 'marketValue', 'avgCost', 'last', 'cancel',
    'chartSubtitle', 'chartNote', 'phaseNote', 'pauseFirst', 'submitted', 'submittedPending',
    'companyProfile', 'companyProfileSubtitle', 'sector', 'stageLabel', 'riskLabel',
    'marketCap', 'sharesOutstanding', 'pe', 'dividendYield', 'macroSensitivity',
    'halted', 'delisted',
    'rightsTitle', 'rightsSubtitle', 'noRights', 'rightsTerms', 'rightsEntitled',
    'rightsCost', 'rightsNone', 'rightsInsufficientCash', 'rightsSubscribe',
    'rightsDecline', 'rightsSubscribed', 'rightsDeclined',
    'marginTitle', 'marginSubtitle', 'shortAvgPrice', 'noShorts', 'longValue',
    'shortValue', 'initialMargin', 'maintenanceMargin', 'marginExcess',
    'buyingPower', 'borrowedCash', 'accruedCharges', 'marginRates',
    'marginCallText', 'marginNoCall', 'chargeType', 'chargeAmount',
    'forcedLiquidation', 'forcedLiquidationText', 'marginTicketNote',
    'etf', 'etfNav', 'etfPremium', 'etfExpenseRatio', 'etfSector', 'etfHoldings',
    'etfHolding', 'etfHoldingWeight', 'etfContribution', 'noEtfHoldings', 'change',
    'optionTitle', 'optionSubtitle', 'optionDealer', 'optionContractSize',
    'optionStrike', 'optionType', 'optionExpiry', 'optionDays', 'optionQty',
    'optionMark', 'optionDaysLeft', 'optionLong', 'optionShort', 'optionClose',
    'optionClosed', 'optionNoPositions', 'optionNoSettlements', 'optionIntrinsic',
    'optionCash', 'optionEmpty', 'optionChainNote', 'optionFormNote',
    'callBidAsk', 'putBidAsk', 'call', 'put', 'optionOpened', 'optionSold',
    'optionValue', 'bondValue',
    'bondTitle', 'bondSubtitle', 'bond', 'bondIssuer', 'bondYears', 'bondCoupon',
    'bondRating', 'bondYield', 'bondAvgPrice', 'bondPositions', 'bondNoPositions',
    'bondCoupons', 'bondNoCoupons', 'bondCouponAmount', 'bondCouponNote',
    'bondFormNote', 'bondBought', 'bondSold', 'bondEmpty',
    'challengeTitle', 'challengeSubtitle', 'challengeIntro', 'challengeActive',
    'challengeStart', 'challengeAbandon', 'challengeAbandonConfirm',
    'challengeAbandoned', 'challengeStarted', 'challengeDays',
    'challengeDaysLeft', 'challengeTarget', 'challengeDrawdown', 'challengeReturn',
    'challengeScore', 'challengeGrade', 'challengeName', 'challengeStatus',
    'challengePositionCap', 'challengeDaysLabel', 'challengeTargetLabel',
    'challengeDrawdownLabel', 'challengeMaxDrawdown',
    'timelineTitle', 'timelineSubtitle', 'timelineDay', 'timelineRewind',
    'timelineToday', 'timelineNote', 'timelineEmpty', 'timelineConfirm',
    'timelineRewound',
    'stop', 'stopLimit', 'trailing', 'stopPrice', 'stopLimitPrice', 'trailPercent',
    'conditionalSubmitted', 'ocoTitle', 'ocoTakeProfit', 'ocoStop', 'ocoSubmit',
    'ocoNote', 'ocoSubmitted', 'optionExercise', 'optionExercised',
    'reportRevenue', 'reportNetIncome', 'reportEps',
    'reportGrossMargin', 'reportOperatingMargin', 'reportNetMargin', 'reportOperatingCashFlow',
    'reportAssets', 'reportLiabilities', 'reportEquity', 'reportCash',
    'reportDividendPerShare', 'reportPeriod', 'reportedOn', 'splitAdjusted', 'noReport',
    'dividends', 'dividendsTotal', 'dividendPerShare', 'dividendAmount', 'noDividends',
    'events', 'eventsSubtitle', 'noEvents', 'eventEarnings', 'eventEps',
    'eventGuidance', 'eventGuidanceText',
    'eventBuyback', 'eventBuybackText', 'eventOffering', 'eventOfferingText',
    'eventMerger', 'eventMergerText', 'eventSpinoff', 'eventSpinoffText',
    'eventHalt', 'eventHaltText',
    'eventRights', 'eventRightsText', 'eventBankruptcy', 'eventBankruptcyText',
    'eventSplit', 'eventSplitText', 'eventReverseSplit', 'eventReverseSplitText',
    'eventDividend', 'eventDividendText',
    'macroTitle', 'macroSubtitle', 'macroNextEvent', 'macroNoEvent',
    'macroActual', 'macroForecast', 'macroSurprise', 'macroBubble',
    'macroPolicyRate', 'macroInflation', 'macroUnemployment', 'macroGdp',
    'macroCreditGrowth', 'macroRiskAppetite', 'macroEnergyPrice', 'macroConfidence',
    'newsTitle', 'newsSubtitle', 'noNews', 'marketWide',
    'reportedOnLabel', 'statementSplitFactor', 'viewStatements', 'statementsEyebrow',
    'statementsTitle', 'statementsSubtitle', 'statementsNoState', 'statementsSourceLabel',
    'statementsNote', 'backToExchange', 'statementControls', 'incomeStatement',
    'balanceSheet', 'cashFlowStatement', 'statementRatios', 'statementLine', 'statementValue',
  ].forEach((key) => check(`exchange.${key}`));
  for (const line of [
    'revenue', 'cogs', 'grossProfit', 'operatingExpenses', 'operatingIncome',
    'interestExpense', 'pretaxIncome', 'taxExpense', 'netIncome', 'eps',
    'sharesOutstanding', 'dividendsPaid', 'cash', 'receivables', 'inventory', 'ppe',
    'totalAssets', 'debt', 'otherLiabilities', 'totalLiabilities', 'equity',
    'operatingCashFlow', 'capex', 'investingCashFlow', 'financingCashFlow',
    'debtIssuance', 'netChange', 'freeCashFlow', 'grossMargin', 'operatingMargin',
    'netMargin', 'roe', 'debtToEquity', 'bookValuePerShare', 'annualDividendPerShare',
    'quarterlyDividendPerShare',
  ]) {
    check(`exchange.statement.${line}`);
  }
  for (const newsTemplate of [
    'productLaunch', 'analystUpgrade', 'buyback', 'contractWin',
    'analystDowngrade', 'lawsuit', 'recall', 'ceoExit',
    'sectorDemand', 'sectorPolicy', 'sectorRegulation', 'sectorInputCost',
    'rateCut', 'riskAppetite', 'rateHike', 'riskOff',
  ]) {
    check(`exchange.news.${newsTemplate}.headline`);
    check(`exchange.news.${newsTemplate}.summary`);
  }
  for (const regime of [
    'normal', 'bull', 'bear', 'highVol', 'crisis', 'liquidity', 'sectorBubble',
    'recession', 'recovery',
  ]) {
    check(`exchange.macro.regime.${regime}`);
  }
  for (const macroEvent of ['cpi', 'payrolls', 'centralBank', 'gdp', 'energy']) {
    check(`exchange.macroEvent.${macroEvent}.label`);
    check(`exchange.macroEvent.${macroEvent}.summary`);
  }
  for (const sector of [...new Set(SIM_COMPANIES.map((company) => company.sector))]) {
    check(`sector.${sector}`);
  }
  for (const stage of ['mature', 'growth', 'highGrowth', 'early', 'turnaround']) {
    check(`exchange.stage.${stage}`);
  }
  for (const risk of ['low', 'medium', 'high', 'veryHigh']) {
    check(`exchange.risk.${risk}`);
  }
  for (const status of ['pending', 'open', 'partiallyFilled', 'filled', 'cancelled', 'rejected']) {
    check(`exchange.status.${status}`);
  }
  for (const status of ['ok', 'call', 'liquidation']) {
    check(`exchange.marginStatus.${status}`);
  }
  for (const charge of ['interest', 'borrowFee']) {
    check(`exchange.charge.${charge}`);
  }
  for (const challenge of ['sprint', 'hedge', 'marathon']) {
    check(`exchange.challenge.${challenge}.name`);
    check(`exchange.challenge.${challenge}.desc`);
  }
  for (const status of ['passed', 'failed', 'abandoned']) {
    check(`exchange.challengeResult.${status}`);
  }
  for (const key of [
    'order.invalid', 'order.limit', 'order.noLiquidity', 'order.insufficientCash',
    'order.insufficientShares', 'order.halted', 'order.delisted',
    'order.insufficientMargin', 'order.noShortPosition', 'order.insufficientShortShares',
    'order.shortPosition', 'order.longPosition',
    'option.invalid', 'option.expired', 'option.insufficientCash',
    'option.insufficientMargin', 'option.positionConflict', 'option.noPosition',
    'option.insufficientContracts',
    'bond.invalid', 'bond.noPosition', 'bond.insufficient', 'bond.insufficientCash',
    'bond.delisted',
    'order.stop', 'order.stopLimit', 'order.trail', 'order.oco',
    'challenge.invalid', 'challenge.active', 'challenge.none',
    'challenge.shortBlocked', 'challenge.marginBlocked', 'challenge.positionLimit',
    'challenge.assetBlocked.stock', 'challenge.assetBlocked.etf',
    'challenge.assetBlocked.bond', 'challenge.assetBlocked.option',
    'option.notLong', 'option.notExpiryDay', 'option.notInTheMoney',
    'option.insufficientShares', 'timeline.notFound',
    'rights.closed', 'rights.none', 'rights.insufficientCash',
    'order.notFound', 'order.notOpen',
  ]) {
    check(`exchange.error.${key}`);
  }
  for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M']) {
    check(`exchange.tf.${tf}`);
  }
  assertEqual(missing.length, 0, missing.join('\n'));
});
