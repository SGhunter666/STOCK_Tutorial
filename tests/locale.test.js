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
    'history.disclaimerLabel', 'history.disclaimer', 'history.scenarioEyebrow',
    'history.independentAccount', 'history.currentDate', 'history.day', 'history.dayShort',
    'history.dayOf', 'history.nextEvent', 'history.atEnd', 'history.reset',
    'history.resetShort', 'history.resetTitle', 'history.resetMessage',
    'history.resetConfirm', 'history.resetDone', 'history.statEquity',
    'history.sinceStartPct', 'history.statCash', 'history.statCashSub', 'history.statPnl',
    'history.statPnlSub', 'history.statBenchmark', 'history.statBenchmarkSub',
    'history.chartTitle', 'history.chartSubtitle', 'history.chartNote', 'history.avgCostLine',
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
    'market.searchPlaceholder', 'market.allSectors', 'market.companiesTitle',
    'market.companiesSubtitle', 'market.company', 'market.sector', 'market.last',
    'market.change', 'market.marketCap', 'market.spread', 'market.trend', 'market.inspect',
    'market.noResults', 'market.disclaimer', 'market.virtualCompany', 'market.bid',
    'market.ask', 'market.dayRange', 'market.volume',
    'trade.eyebrow', 'trade.chartTitle', 'trade.chartSubtitle', 'trade.chartRange',
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
    'settings.dataTitle', 'settings.dataSubtitle', 'settings.saveStatus', 'settings.lastSaved',
    'settings.notSavedYet', 'settings.saveNow', 'settings.exportSave', 'settings.importSave',
    'settings.resetProgress', 'settings.dataHint', 'settings.scopeTitle', 'settings.scopeSubtitle',
    'settings.scopeText', 'settings.scopeIncluded', 'settings.scopePlanned',
    'settings.scope.p1a', 'settings.scope.p1b', 'settings.scope.p1c', 'settings.scope.p1d',
    'settings.scope.p1e', 'settings.scope.p1f',
    'settings.scope.future.a', 'settings.scope.future.b', 'settings.scope.future.c',
    'settings.scope.future.d', 'settings.disclaimer', 'settings.resetTitle',
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
  ].forEach((key) => check(key));
  assertEqual(missing.length, 0, missing.join('\n'));
});
