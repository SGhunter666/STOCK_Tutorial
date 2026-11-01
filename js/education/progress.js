/**
 * XP, levels and achievements. XP is a learning score only: it never converts into
 * trading cash, so it cannot distort the financial simulation.
 */
export const XP_RULES = {
  section: 5,
  practice: 25,
  quizPass: 40,
  quizPerfect: 15,
  unitComplete: 20,
  testOut: 60,
};

export const LEVEL_XP = 150;

export function awardXp(education, key, amount) {
  if (!education.xpAwards) education.xpAwards = {};
  if (education.xpAwards[key] != null) return 0;
  education.xpAwards[key] = amount;
  education.xp = (education.xp || 0) + amount;
  return amount;
}

export function levelInfo(xp = 0) {
  const level = Math.floor(xp / LEVEL_XP) + 1;
  const intoLevel = xp % LEVEL_XP;
  return {
    level,
    xp,
    intoLevel,
    needed: LEVEL_XP,
    pct: (intoLevel / LEVEL_XP) * 100,
    nextLevelAt: level * LEVEL_XP,
  };
}

const unitsOf = (state) => state.education.units || {};

export const ACHIEVEMENTS = [
  {
    id: 'observer',
    titleKey: 'achievement.observer.title',
    descKey: 'achievement.observer.desc',
    check: (state) => (state.education.inspectedTickers || []).length >= 2,
  },
  {
    id: 'firstTrade',
    titleKey: 'achievement.firstTrade.title',
    descKey: 'achievement.firstTrade.desc',
    check: (state) => (state.account.trades || []).length > 0,
  },
  {
    id: 'firstPractice',
    titleKey: 'achievement.firstPractice.title',
    descKey: 'achievement.firstPractice.desc',
    check: (state) => Object.values(unitsOf(state)).some((u) => u.practiceDone),
  },
  {
    id: 'academyInitiate',
    titleKey: 'achievement.academyInitiate.title',
    descKey: 'achievement.academyInitiate.desc',
    check: (state) => Boolean(unitsOf(state).u1 && unitsOf(state).u1.completedAt),
  },
  {
    id: 'quizAce',
    titleKey: 'achievement.quizAce.title',
    descKey: 'achievement.quizAce.desc',
    check: (state) => Object.values(unitsOf(state)).some((u) => u.quizBest === 100),
  },
  {
    id: 'limitMaster',
    titleKey: 'achievement.limitMaster.title',
    descKey: 'achievement.limitMaster.desc',
    check: (state) => (state.orders || []).some((o) => o.status === 'filled' && o.type === 'limit'),
  },
  {
    id: 'bilingual',
    titleKey: 'achievement.bilingual.title',
    descKey: 'achievement.bilingual.desc',
    check: (state) => Boolean(state.education.languageSwitched),
  },
  {
    id: 'glossaryExplorer',
    titleKey: 'achievement.glossaryExplorer.title',
    descKey: 'achievement.glossaryExplorer.desc',
    check: (state) => (state.education.glossaryOpened || []).length >= 3,
  },
  {
    id: 'stageOneGraduate',
    titleKey: 'achievement.stageOneGraduate.title',
    descKey: 'achievement.stageOneGraduate.desc',
    check: (state) => ['u1', 'u2', 'u3', 'u4'].every((id) => unitsOf(state)[id] && unitsOf(state)[id].completedAt),
  },
];

/** Returns achievement ids that became true and records them on the education state. */
export function evaluateAchievements(state) {
  const education = state.education;
  if (!education.achievements) education.achievements = [];
  const unlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (education.achievements.includes(achievement.id)) continue;
    try {
      if (achievement.check(state)) {
        education.achievements.push(achievement.id);
        unlocked.push(achievement.id);
      }
    } catch (err) {
      console.error('[achievements] check failed', achievement.id, err);
    }
  }
  return unlocked;
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
