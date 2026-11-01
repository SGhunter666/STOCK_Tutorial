/**
 * Career mode: eight ranks, promotion requirements and a monthly salary.
 * Requirements are evaluated from real progress, trades and account equity.
 */
import { CORE_UNITS, BRANCH_UNITS, getBranch, getUnit } from './curriculum.js';
import { isUnitComplete } from './lessonEngine.js';
import { CHALLENGES, challengeById } from './challenges.js';
import { equity } from '../trading/account.js';
import { awardXp } from './progress.js';

export const CAREER_SALARY_INTERVAL = 21;

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
    ],
  },
  {
    number: 4,
    id: 'quant',
    titleKey: 'career.rank.quant.title',
    descKey: 'career.rank.quant.desc',
    salary: 700,
    xp: 200,
    requirements: [unit('u16'), demo('risk'), { kind: 'trades', target: 20 }, { kind: 'xp', target: 1200 }],
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
  return {
    rank,
    promotedAtDay,
    salaryPaidDay,
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
  state.career = career;
  const xpGained = awardXp(state.education, `career:rank:${nextRank.number}`, nextRank.xp);
  store.update(() => {}, { type: 'career:promoted', rank: nextRank.number });
  if (bus) bus.emit('career:promoted', { rank: nextRank.number, xpGained });
  return { ok: true, rank: nextRank, xpGained };
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
