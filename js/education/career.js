/**
 * Career mode: eight ranks, promotion requirements and a monthly salary.
 * Requirements are evaluated from real progress, trades and account equity.
 */
import { CORE_UNITS, BRANCH_UNITS, getBranch, getUnit } from './curriculum.js';
import { isUnitComplete } from './lessonEngine.js';
import { CHALLENGES, challengeById } from './challenges.js';
import { equity } from '../trading/account.js';
import { awardXp } from './progress.js';
import { isCompanyUnlocked } from '../market/marketAccess.js';
import { indicatorSnapshot } from '../market/indicators.js';

export const CAREER_SALARY_INTERVAL = 21;
export const CAREER_EVAL_INTERVAL = 21;
export const REPORT_MIN_SCORE = 60;
export const REPORT_THESES = ['bull', 'bear', 'neutral'];
export const RESEARCH_TASK_LIMIT = 2;

export const RESEARCH_TASK_DEFS = [
  {
    kind: 'equity',
    titleKey: 'career.task.equity.title',
    descKey: 'career.task.equity.desc',
    deadlineDays: 12,
    rewardXp: 100,
    rewardCash: 120,
  },
  {
    kind: 'sector',
    titleKey: 'career.task.sector.title',
    descKey: 'career.task.sector.desc',
    deadlineDays: 15,
    rewardXp: 130,
    rewardCash: 160,
  },
  {
    kind: 'risk',
    titleKey: 'career.task.risk.title',
    descKey: 'career.task.risk.desc',
    deadlineDays: 10,
    rewardXp: 90,
    rewardCash: 100,
  },
];

export const CAREER_CERTIFICATES = [
  {
    id: 'foundation',
    titleKey: 'career.cert.foundation.title',
    descKey: 'career.cert.foundation.desc',
    kind: 'units',
    unitIds: ['u1', 'u2', 'u3', 'u4'],
    target: 4,
  },
  {
    id: 'technical',
    titleKey: 'career.cert.technical.title',
    descKey: 'career.cert.technical.desc',
    kind: 'units',
    unitIds: ['u16', 'u17', 'u19'],
    target: 3,
  },
  {
    id: 'analyst',
    titleKey: 'career.cert.analyst.title',
    descKey: 'career.cert.analyst.desc',
    kind: 'reports',
    target: 3,
    minScore: 70,
  },
  {
    id: 'manager',
    titleKey: 'career.cert.manager.title',
    descKey: 'career.cert.manager.desc',
    kind: 'evaluations',
    target: 2,
    minScore: 70,
  },
  {
    id: 'founder',
    titleKey: 'career.cert.founder.title',
    descKey: 'career.cert.founder.desc',
    kind: 'rank',
    target: 6,
  },
];

const unit = (unitId) => ({ kind: 'unit', unitId, target: 1 });
const demo = (demoId) => ({ kind: 'demo', demoId, target: 1 });
const challenge = (challengeId) => ({ kind: 'challenge', challengeId, target: 1 });
const branch = (branchId) => ({ kind: 'branch', branchId, target: 1 });

export const CAREER_RANKS = [
  {
    number: 1,
    id: 'retail',
    titleKey: 'career.rank.retail.title',
    descKey: 'career.rank.retail.desc',
    salary: 0,
    xp: 0,
    requirements: [unit('u4'), { kind: 'trades', target: 1 }, { kind: 'inspected', target: 3 }],
  },
  {
    number: 2,
    id: 'trader',
    titleKey: 'career.rank.trader.title',
    descKey: 'career.rank.trader.desc',
    salary: 200,
    xp: 100,
    requirements: [unit('u8'), { kind: 'trades', target: 10 }, { kind: 'equity', target: 11000 }],
  },
  {
    number: 3,
    id: 'research',
    titleKey: 'career.rank.research.title',
    descKey: 'career.rank.research.desc',
    salary: 400,
    xp: 150,
    requirements: [
      unit('u12'),
      demo('financials'),
      demo('dcf'),
      { kind: 'inspected', target: 8 },
      { kind: 'reports', target: 1 },
    ],
  },
  {
    number: 4,
    id: 'quant',
    titleKey: 'career.rank.quant.title',
    descKey: 'career.rank.quant.desc',
    salary: 700,
    xp: 200,
    requirements: [
      unit('u16'), demo('risk'), { kind: 'trades', target: 20 }, { kind: 'xp', target: 1200 },
      { kind: 'reports', target: 3 },
    ],
  },
  {
    number: 5,
    id: 'pm',
    titleKey: 'career.rank.pm.title',
    descKey: 'career.rank.pm.desc',
    salary: 1200,
    xp: 250,
    requirements: [
      unit('u30'),
      { kind: 'options', target: 1 },
      { kind: 'futures', target: 1 },
      challenge('hedger'),
      { kind: 'evaluations', target: 1 },
    ],
  },
  {
    number: 6,
    id: 'hedge',
    titleKey: 'career.rank.hedge.title',
    descKey: 'career.rank.hedge.desc',
    salary: 2000,
    xp: 300,
    requirements: [
      unit('u32'),
      { kind: 'branches', target: 1 },
      { kind: 'challenges', target: 3 },
      { kind: 'equity', target: 30000 },
    ],
  },
  {
    number: 7,
    id: 'founder',
    titleKey: 'career.rank.founder.title',
    descKey: 'career.rank.founder.desc',
    salary: 3500,
    xp: 400,
    requirements: [
      { kind: 'branches', target: 3 },
      { kind: 'challenges', target: 5 },
      { kind: 'equity', target: 60000 },
      { kind: 'xp', target: 4500 },
      { kind: 'certificates', target: 3 },
    ],
  },
  {
    number: 8,
    id: 'ceo',
    titleKey: 'career.rank.ceo.title',
    descKey: 'career.rank.ceo.desc',
    salary: 6000,
    xp: 500,
    requirements: [],
  },
];

export function careerRankByNumber(number) {
  return CAREER_RANKS.find((rank) => rank.number === number) || CAREER_RANKS[0];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function gradeForScore(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function normalizeTask(task, index) {
  if (!task || typeof task !== 'object') return null;
  const def = RESEARCH_TASK_DEFS.find((entry) => entry.kind === task.kind) || RESEARCH_TASK_DEFS[0];
  const status = ['available', 'active', 'completed', 'expired'].includes(task.status)
    ? task.status
    : 'available';
  const deadlineDay = Number.isFinite(Number(task.deadlineDay))
    ? Number(task.deadlineDay)
    : Number(task.day) + def.deadlineDays;
  return {
    id: String(task.id || `task-${index + 1}`),
    kind: def.kind,
    titleKey: def.titleKey,
    descKey: def.descKey,
    ticker: typeof task.ticker === 'string' && task.ticker ? task.ticker : 'AURA',
    day: Number.isFinite(Number(task.day)) ? Number(task.day) : 0,
    deadlineDay: Number.isFinite(deadlineDay) ? deadlineDay : 0,
    status,
    acceptedDay: Number.isFinite(Number(task.acceptedDay)) ? Number(task.acceptedDay) : null,
    completedDay: Number.isFinite(Number(task.completedDay)) ? Number(task.completedDay) : null,
    reportId: typeof task.reportId === 'string' ? task.reportId : null,
    rewardXp: Number.isFinite(Number(task.rewardXp)) ? Number(task.rewardXp) : def.rewardXp,
    rewardCash: Number.isFinite(Number(task.rewardCash)) ? Number(task.rewardCash) : def.rewardCash,
  };
}

function normalizeReport(report, index) {
  if (!report || typeof report !== 'object') return null;
  const score = clampNumber(report.score, 0, 100, 0);
  return {
    id: String(report.id || `report-${index + 1}`),
    taskId: typeof report.taskId === 'string' ? report.taskId : '',
    ticker: typeof report.ticker === 'string' && report.ticker ? report.ticker : 'AURA',
    thesis: REPORT_THESES.includes(report.thesis) ? report.thesis : 'neutral',
    conviction: Math.round(clampNumber(report.conviction, 1, 5, 3)),
    targetPrice: Number.isFinite(Number(report.targetPrice)) ? Number(report.targetPrice) : 0,
    summary: typeof report.summary === 'string' ? report.summary : '',
    day: Number.isFinite(Number(report.day)) ? Number(report.day) : 0,
    score,
    grade: ['A', 'B', 'C', 'D'].includes(report.grade) ? report.grade : gradeForScore(score),
  };
}

function normalizeEvaluation(evaluation, index) {
  if (!evaluation || typeof evaluation !== 'object') return null;
  const score = clampNumber(evaluation.score, 0, 100, 0);
  return {
    id: String(evaluation.id || `eval-${index + 1}`),
    day: Number.isFinite(Number(evaluation.day)) ? Number(evaluation.day) : 0,
    fromDay: Number.isFinite(Number(evaluation.fromDay)) ? Number(evaluation.fromDay) : 0,
    equityStart: Number.isFinite(Number(evaluation.equityStart)) ? Number(evaluation.equityStart) : 0,
    equityEnd: Number.isFinite(Number(evaluation.equityEnd)) ? Number(evaluation.equityEnd) : 0,
    returnPct: Number.isFinite(Number(evaluation.returnPct)) ? Number(evaluation.returnPct) : 0,
    drawdownPct: Number.isFinite(Number(evaluation.drawdownPct)) ? Number(evaluation.drawdownPct) : 0,
    reports: Number.isFinite(Number(evaluation.reports)) ? Number(evaluation.reports) : 0,
    avgReportScore: Number.isFinite(Number(evaluation.avgReportScore))
      ? Number(evaluation.avgReportScore)
      : 0,
    score,
    grade: ['A', 'B', 'C', 'D'].includes(evaluation.grade) ? evaluation.grade : gradeForScore(score),
    xp: Number.isFinite(Number(evaluation.xp)) ? Number(evaluation.xp) : 0,
  };
}

export function normalizeCareer(career, day = 0) {
  const source = career && typeof career === 'object' ? career : {};
  const currentDay = Number.isFinite(Number(day)) ? Math.max(0, Number(day)) : 0;
  const rawRank = Number(source.rank);
  const rank = Math.max(1, Math.min(CAREER_RANKS.length, Number.isFinite(rawRank) ? rawRank : 1));
  const promotedAtDay = Number.isFinite(Number(source.promotedAtDay))
    ? Number(source.promotedAtDay)
    : currentDay;
  const salaryPaidDay = Number.isFinite(Number(source.salaryPaidDay))
    ? Number(source.salaryPaidDay)
    : currentDay;
  const history = Array.isArray(source.history) && source.history.length
    ? source.history
    : [{ rank, day: currentDay }];
  const tasks = (Array.isArray(source.tasks) ? source.tasks : [])
    .map((task, index) => normalizeTask(task, index))
    .filter(Boolean)
    .slice(-40);
  const reports = (Array.isArray(source.reports) ? source.reports : [])
    .map((report, index) => normalizeReport(report, index))
    .filter(Boolean)
    .slice(-40);
  const evaluations = (Array.isArray(source.evaluations) ? source.evaluations : [])
    .map((evaluation, index) => normalizeEvaluation(evaluation, index))
    .filter(Boolean)
    .slice(-24);
  const certificates = (Array.isArray(source.certificates) ? source.certificates : [])
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => ({ id: entry.id, day: Number.isFinite(Number(entry.day)) ? Number(entry.day) : currentDay }))
    .slice(-12);
  const taskSeq = Math.max(
    Math.round(clampNumber(source.taskSeq, 1, 10000, 1)),
    tasks.length + 1,
  );
  const reportSeq = Math.max(
    Math.round(clampNumber(source.reportSeq, 1, 10000, 1)),
    reports.length + 1,
  );
  const evalSeq = Math.max(
    Math.round(clampNumber(source.evalSeq, 1, 10000, 1)),
    evaluations.length + 1,
  );
  return {
    rank,
    promotedAtDay,
    salaryPaidDay,
    lastEvalDay: Number.isFinite(Number(source.lastEvalDay))
      ? Number(source.lastEvalDay)
      : currentDay,
    taskSeq,
    reportSeq,
    evalSeq,
    tasks,
    reports,
    evaluations,
    certificates,
    history,
  };
}

function completedBranches(state) {
  return BRANCH_UNITS.filter((entry) => isUnitComplete(state, entry.id)).length;
}

function requirementProgress(state, requirement) {
  const kind = requirement.kind;
  let current = 0;
  let target = requirement.target || 1;
  switch (kind) {
    case 'unit':
      current = isUnitComplete(state, requirement.unitId) ? 1 : 0;
      break;
    case 'units':
      current = CORE_UNITS.filter((entry) => isUnitComplete(state, entry.id)).length;
      break;
    case 'trades':
      current = (state.account.trades || []).length;
      break;
    case 'inspected':
      current = (state.education.inspectedTickers || []).length;
      break;
    case 'demo':
      current = (state.education.demoRuns || []).includes(requirement.demoId) ? 1 : 0;
      break;
    case 'equity':
      current = equity(state.account, state.market.quotes);
      break;
    case 'options':
      current = (state.account.optionTrades || []).length;
      break;
    case 'futures':
      current = (state.account.futuresTrades || []).length;
      break;
    case 'challenge':
      current = (state.challenges?.completed || []).includes(requirement.challengeId) ? 1 : 0;
      break;
    case 'challenges':
      current = (state.challenges?.completed || []).length;
      break;
    case 'branch':
      current = isUnitComplete(state, getBranch(requirement.branchId)?.unitId || '') ? 1 : 0;
      break;
    case 'branches':
      current = completedBranches(state);
      break;
    case 'xp':
      current = state.education.xp || 0;
      break;
    case 'reports':
      current = normalizeCareer(state.career, state.market.day).reports
        .filter((report) => report.score >= REPORT_MIN_SCORE).length;
      break;
    case 'reportScore':
      current = Math.max(0, ...normalizeCareer(state.career, state.market.day).reports.map((report) => report.score));
      break;
    case 'evaluations':
      current = normalizeCareer(state.career, state.market.day).evaluations
        .filter((evaluation) => evaluation.score >= 55).length;
      break;
    case 'certificates':
      current = normalizeCareer(state.career, state.market.day).certificates.length;
      break;
    default:
      current = 0;
  }
  return {
    ...requirement,
    target,
    current: Math.min(current, target),
    rawCurrent: current,
    done: current >= target,
    pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
  };
}

export function careerProgress(state) {
  const career = normalizeCareer(state.career, state.market.day);
  const rank = careerRankByNumber(career.rank);
  const next = CAREER_RANKS.find((entry) => entry.number === rank.number + 1) || null;
  const requirements = rank.requirements.map((requirement) => requirementProgress(state, requirement));
  const ready = Boolean(next && requirements.every((requirement) => requirement.done));
  const salary = rank.salary;
  const nextSalaryDay = salary > 0 ? career.salaryPaidDay + CAREER_SALARY_INTERVAL : null;
  return {
    career,
    rank,
    next,
    requirements,
    ready,
    salary,
    nextSalaryDay,
    daysToSalary: nextSalaryDay != null ? Math.max(0, nextSalaryDay - state.market.day) : null,
    careerIncome: state.account.careerIncome || 0,
    tasks: career.tasks,
    activeTasks: career.tasks.filter((task) => task.status === 'active'),
    availableTasks: career.tasks.filter((task) => task.status === 'available'),
    reports: career.reports,
    evaluations: career.evaluations,
    certificates: careerCertificates(state, career),
    passedReports: career.reports.filter((report) => report.score >= REPORT_MIN_SCORE).length,
  };
}

function unlockedResearchTickers(state) {
  const quotes = state.market?.quotes || {};
  const tickers = Object.keys(quotes).sort();
  const unlocked = tickers.filter((ticker) => isCompanyUnlocked(state, ticker));
  return unlocked.length ? unlocked : tickers;
}

export function refreshResearchTasks(state, day = state.market.day) {
  const career = normalizeCareer(state.career, day);
  if (career.rank < 2) return career;
  const tickers = unlockedResearchTickers(state);
  let tasks = career.tasks.map((task) => (
    (task.status === 'available' || task.status === 'active') && day > task.deadlineDay
      ? { ...task, status: 'expired' }
      : task
  ));
  let available = tasks.filter((task) => task.status === 'available').length;
  let seq = career.taskSeq;
  while (available < RESEARCH_TASK_LIMIT && seq <= career.taskSeq + 8) {
    const def = RESEARCH_TASK_DEFS[(seq - 1) % RESEARCH_TASK_DEFS.length];
    const ticker = tickers[(seq - 1) % Math.max(1, tickers.length)] || 'AURA';
    tasks.push({
      id: `task-${seq}`,
      kind: def.kind,
      titleKey: def.titleKey,
      descKey: def.descKey,
      ticker,
      day,
      deadlineDay: day + def.deadlineDays,
      status: 'available',
      acceptedDay: null,
      completedDay: null,
      reportId: null,
      rewardXp: def.rewardXp,
      rewardCash: def.rewardCash,
    });
    seq += 1;
    available += 1;
  }
  return { ...career, tasks: tasks.slice(-40), taskSeq: seq };
}

export function acceptResearchTask(store, bus, taskId) {
  const state = store.get();
  const career = normalizeCareer(state.career, state.market.day);
  const task = career.tasks.find((entry) => entry.id === taskId);
  if (!task || task.status !== 'available') return { ok: false, error: 'career.task.errorUnavailable' };
  const active = career.tasks.filter((entry) => entry.status === 'active').length;
  if (active >= RESEARCH_TASK_LIMIT) return { ok: false, error: 'career.task.errorActive' };
  const nextTask = { ...task, status: 'active', acceptedDay: state.market.day };
  const next = { ...career, tasks: career.tasks.map((entry) => (entry.id === taskId ? nextTask : entry)) };
  state.career = next;
  store.update(() => {}, { type: 'career:task-accepted', taskId });
  if (bus) bus.emit('career:task-accepted', { taskId, ticker: task.ticker });
  return { ok: true, task: nextTask };
}

export function gradeInvestmentReport(state, input) {
  const quote = state.market?.quotes?.[input.ticker] || { last: 0 };
  const summary = String(input.summary || '').trim();
  const last = Number(quote.last) || 0;
  const target = Number(input.targetPrice) || 0;
  const trend = indicatorSnapshot(state.market?.history?.[input.ticker], quote.last)?.trend || 'unknown';
  const inspected = (state.education?.inspectedTickers || []).includes(input.ticker);
  const financialsDone = isUnitComplete(state, 'u12');

  let score = 20;
  if (summary.length >= 240) score += 30;
  else if (summary.length >= 140) score += 24;
  else if (summary.length >= 80) score += 16;
  else if (summary.length >= 40) score += 8;
  score += inspected ? 15 : 5;
  if (last > 0 && target > 0) {
    const deviation = Math.abs(target - last) / last;
    if (deviation <= 0.15) score += 15;
    else if (deviation <= 0.3) score += 10;
    else if (deviation <= 0.5) score += 5;
    else score += 2;
  }
  const thesisMatches = (input.thesis === 'bull' && trend === 'up')
    || (input.thesis === 'bear' && trend === 'down')
    || (input.thesis === 'neutral' && (trend === 'flat' || trend === 'unknown'));
  const conviction = Math.round(clampNumber(input.conviction, 1, 5, 3));
  if (thesisMatches) score += 15;
  else if (conviction <= 2) score += 8;
  else score += 4;
  if (financialsDone) score += 5;
  if (summary.length >= 40 && /\d/.test(summary)) score += 10;
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: finalScore,
    grade: gradeForScore(finalScore),
    trend,
    inspected,
    financialsDone,
  };
}

export function submitInvestmentReport(store, bus, input) {
  const state = store.get();
  const career = normalizeCareer(state.career, state.market.day);
  const task = career.tasks.find((entry) => entry.id === input.taskId);
  if (!task) return { ok: false, error: 'career.report.errorTask' };
  if (task.status !== 'active') return { ok: false, error: 'career.report.errorTaskState' };
  const summary = String(input.summary || '').trim();
  if (summary.length < 40) return { ok: false, error: 'career.report.errorSummary' };
  const targetPrice = Number(input.targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return { ok: false, error: 'career.report.errorTarget' };
  if (!REPORT_THESES.includes(input.thesis)) return { ok: false, error: 'career.report.errorThesis' };
  const conviction = Number(input.conviction);
  if (!Number.isFinite(conviction) || conviction < 1 || conviction > 5) {
    return { ok: false, error: 'career.report.errorConviction' };
  }
  const quote = state.market.quotes[task.ticker];
  if (!quote) return { ok: false, error: 'error.unknownTicker' };

  const graded = gradeInvestmentReport(state, {
    ticker: task.ticker,
    thesis: input.thesis,
    conviction,
    targetPrice,
    summary,
  });
  const report = {
    id: `report-${career.reportSeq}`,
    taskId: task.id,
    ticker: task.ticker,
    thesis: input.thesis,
    conviction: Math.round(conviction),
    targetPrice: Math.round(targetPrice * 100) / 100,
    summary: summary.slice(0, 2000),
    day: state.market.day,
    score: graded.score,
    grade: graded.grade,
  };
  const passed = graded.score >= REPORT_MIN_SCORE;
  const cash = passed ? Math.round(task.rewardCash * graded.score / 100) : 0;
  const bonusXp = graded.grade === 'A' ? 40 : graded.grade === 'B' ? 20 : graded.grade === 'C' ? 10 : 0;
  const xpGained = passed ? awardXp(state.education, `career:report:${report.id}`, task.rewardXp + bonusXp) : 0;
  const nextTask = {
    ...task,
    status: 'completed',
    completedDay: state.market.day,
    reportId: report.id,
  };
  const nextCareer = {
    ...career,
    reportSeq: career.reportSeq + 1,
    reports: [report, ...career.reports].slice(0, 40),
    tasks: career.tasks.map((entry) => (entry.id === task.id ? nextTask : entry)),
  };
  state.career = nextCareer;
  state.account = {
    ...state.account,
    cash: Math.round((state.account.cash + cash) * 100) / 100,
    careerIncome: Math.round(((state.account.careerIncome || 0) + cash) * 100) / 100,
  };
  store.update(() => {}, { type: 'career:report-graded', reportId: report.id, score: report.score });
  if (bus) bus.emit('career:report-graded', { report, task: nextTask, xpGained, cash });
  return {
    ok: true, report, task: nextTask, xpGained, cash, passed,
  };
}

export function evaluateCareerPerformance(state, day = state.market.day) {
  const career = normalizeCareer(state.career, day);
  if (career.rank < 2) return { career, due: false, evaluation: null, xpGained: 0 };
  if (day < career.lastEvalDay + CAREER_EVAL_INTERVAL) {
    return { career, due: false, evaluation: null, xpGained: 0 };
  }
  const fromDay = career.lastEvalDay;
  const history = (state.account?.equityHistory || [])
    .filter((entry) => Number.isFinite(entry.day) && entry.day >= fromDay && entry.day <= day)
    .map((entry) => entry.equity);
  const start = history.length ? history[0] : (state.account?.initialCash || 0);
  const end = history.length ? history[history.length - 1] : equity(state.account, state.market.quotes);
  const returnPct = start > 0 ? ((end - start) / start) * 100 : 0;
  let peak = history.length ? history[0] : start;
  let worst = 0;
  for (const value of history) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, (value - peak) / peak);
  }
  const drawdownPct = Math.abs(worst * 100);
  const periodReports = career.reports.filter((report) => report.day >= fromDay && report.day <= day);
  const passedReports = periodReports.filter((report) => report.score >= REPORT_MIN_SCORE);
  const avgReportScore = periodReports.length
    ? periodReports.reduce((sum, report) => sum + report.score, 0) / periodReports.length
    : 0;
  let score = 55;
  score += Math.max(-25, Math.min(25, returnPct * 2));
  score -= Math.min(25, drawdownPct * 1.5);
  score += Math.min(15, periodReports.length * 5);
  if (avgReportScore >= 60) score += Math.min(10, (avgReportScore - 60) / 4);
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeForScore(finalScore);
  const xpTable = { A: 120, B: 80, C: 40, D: 15 };
  const xpGained = awardXp(state.education, `career:eval:${career.evalSeq}`, xpTable[grade]);
  const evaluation = {
    id: `eval-${career.evalSeq}`,
    day,
    fromDay,
    equityStart: Math.round(start * 100) / 100,
    equityEnd: Math.round(end * 100) / 100,
    returnPct: Math.round(returnPct * 100) / 100,
    drawdownPct: Math.round(drawdownPct * 100) / 100,
    reports: passedReports.length,
    avgReportScore: Math.round(avgReportScore * 10) / 10,
    score: finalScore,
    grade,
    xp: xpGained,
  };
  const next = {
    ...career,
    lastEvalDay: day,
    evalSeq: career.evalSeq + 1,
    evaluations: [evaluation, ...career.evaluations].slice(0, 24),
  };
  return {
    career: next, due: true, evaluation, xpGained,
  };
}

export function certificateProgress(state, certificate, career) {
  const normalized = career || normalizeCareer(state.career, state.market.day);
  let current = 0;
  if (certificate.kind === 'units') {
    current = certificate.unitIds.filter((unitId) => isUnitComplete(state, unitId)).length;
  } else if (certificate.kind === 'reports') {
    current = normalized.reports.filter((report) => report.score >= (certificate.minScore || 0)).length;
  } else if (certificate.kind === 'evaluations') {
    current = normalized.evaluations
      .filter((evaluation) => evaluation.score >= (certificate.minScore || 0)).length;
  } else if (certificate.kind === 'rank') {
    current = normalized.rank;
  }
  const target = certificate.target || 1;
  const earned = normalized.certificates.some((entry) => entry.id === certificate.id);
  return {
    ...certificate,
    current: Math.min(current, target),
    rawCurrent: current,
    target,
    earned,
    done: current >= target,
    pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
  };
}

export function careerCertificates(state, career) {
  const normalized = career || normalizeCareer(state.career, state.market.day);
  return CAREER_CERTIFICATES.map((certificate) => certificateProgress(state, certificate, normalized));
}

export function syncCareerCertificates(state, day = state.market.day) {
  const career = normalizeCareer(state.career, day);
  const newlyEarned = careerCertificates(state, career).filter((entry) => entry.done && !entry.earned);
  if (!newlyEarned.length) return { career, newlyEarned };
  return {
    career: {
      ...career,
      certificates: [
        ...career.certificates,
        ...newlyEarned.map((entry) => ({ id: entry.id, day })),
      ].slice(-12),
    },
    newlyEarned,
  };
}

export function promoteCareer(store, bus) {
  const state = store.get();
  const progress = careerProgress(state);
  if (!progress.next) return { ok: false, error: 'career.errorMaxRank' };
  if (!progress.ready) return { ok: false, error: 'career.errorNotReady' };
  const nextRank = progress.next;
  const career = normalizeCareer(state.career, state.market.day);
  career.rank = nextRank.number;
  career.promotedAtDay = state.market.day;
  career.history = [...career.history, { rank: nextRank.number, day: state.market.day }].slice(-16);
  state.career = refreshResearchTasks({ ...state, career }, state.market.day);
  const synced = syncCareerCertificates(state, state.market.day);
  state.career = synced.career;
  const xpGained = awardXp(state.education, `career:rank:${nextRank.number}`, nextRank.xp);
  store.update(() => {}, { type: 'career:promoted', rank: nextRank.number });
  if (bus) bus.emit('career:promoted', { rank: nextRank.number, xpGained, certificates: synced.newlyEarned });
  return {
    ok: true, rank: nextRank, xpGained, certificates: synced.newlyEarned,
  };
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyCareerSalary(account, career, day) {
  const normalized = normalizeCareer(career, day);
  const rank = careerRankByNumber(normalized.rank);
  if (rank.salary <= 0) return { account, career: normalized, amount: 0, paid: false };
  if (day < normalized.salaryPaidDay + CAREER_SALARY_INTERVAL) {
    return { account, career: normalized, amount: 0, paid: false };
  }
  const nextCareer = {
    ...normalized,
    salaryPaidDay: normalized.salaryPaidDay + CAREER_SALARY_INTERVAL,
  };
  const amount = rank.salary;
  return {
    account: {
      ...account,
      cash: round2(account.cash + amount),
      careerIncome: round2((account.careerIncome || 0) + amount),
    },
    career: nextCareer,
    amount,
    paid: true,
  };
}

export function careerRequirementUnit(requirement) {
  return requirement.unitId ? getUnit(requirement.unitId) : null;
}

export function careerRequirementChallenge(requirement) {
  return requirement.challengeId ? challengeById(requirement.challengeId) : null;
}

export function careerRequirementBranch(requirement) {
  return requirement.branchId ? getBranch(requirement.branchId) : null;
}

export function careerChallenges() {
  return CHALLENGES;
}
