/**
 * Lesson engine: owns course progress. Views must call these functions instead of
 * writing completion flags directly.
 */
import { ALL_UNITS, STAGE_1_UNITS, getUnit, sectionKey } from './curriculum.js';
import { XP_RULES, awardXp, evaluateAchievements } from './progress.js';

export function ensureUnitProgress(state, unitId) {
  if (!state.education.units) state.education.units = {};
  if (!state.education.units[unitId]) {
    state.education.units[unitId] = {
      sectionsRead: {},
      quizBest: null,
      quizAttempts: 0,
      lastScore: null,
      practiceDone: false,
      practiceDoneAt: null,
      placedOut: false,
      completedAt: null,
    };
  }
  return state.education.units[unitId];
}

export function unitState(state, unitId) {
  return state.education.units ? state.education.units[unitId] : null;
}

export function isSectionRead(state, unitId, sectionId) {
  const progress = unitState(state, unitId);
  return Boolean(progress && progress.sectionsRead && progress.sectionsRead[sectionId]);
}

export function sectionsReadCount(state, unit) {
  const progress = unitState(state, unit.id);
  if (!progress) return 0;
  return unit.sections.filter((section) => progress.sectionsRead[section.id]).length;
}

export function isUnitComplete(state, unitId) {
  const progress = unitState(state, unitId);
  return Boolean(progress && progress.completedAt);
}

export function isUnitUnlocked(state, unit) {
  if (!unit || !unit.implemented) return false;
  return (unit.prerequisites || []).every((id) => isUnitComplete(state, id));
}

export function unitProgress(state, unit) {
  const progress = ensureUnitProgress(state, unit.id);
  const read = unit.sections.filter((section) => progress.sectionsRead[section.id]).length;
  const total = unit.sections.length;
  const allRead = read === total;
  const quizPassed = (progress.quizBest || 0) >= (unit.quiz?.passScore || 80);
  const requirementsMet = allRead && progress.practiceDone;
  const pct = Math.round(
    ((Math.min(read, total) / total * 0.5
      + (progress.practiceDone ? 0.25 : 0)
      + (quizPassed ? 0.25 : 0)) * 100),
  );
  return {
    read,
    total,
    allRead,
    practiceDone: progress.practiceDone,
    quizBest: progress.quizBest,
    quizAttempts: progress.quizAttempts,
    quizPassed,
    placedOut: progress.placedOut,
    completed: Boolean(progress.completedAt),
    requirementsMet,
    pct: progress.completedAt ? 100 : Math.min(99, pct),
    progress,
  };
}

function afterProgress(store, bus, context) {
  const state = store.get();
  const achievements = evaluateAchievements(state);
  store.update(() => {}, { type: 'education:achievements' });
  if (bus) {
    for (const id of achievements) bus.emit('achievement:unlocked', { id });
    if (context) bus.emit('progress:updated', context);
  }
  return achievements;
}

export function evaluateCompletion(store, bus, unitId) {
  const state = store.get();
  const unit = getUnit(unitId);
  if (!unit || !unit.implemented) return { completed: false };
  const progress = ensureUnitProgress(state, unitId);
  if (progress.completedAt) return { completed: true, justCompleted: false };

  const quizPassed = (progress.quizBest || 0) >= (unit.quiz?.passScore || 80);
  const allRead = unit.sections.every((section) => progress.sectionsRead[section.id]);
  const eligible = quizPassed && (progress.placedOut || (allRead && progress.practiceDone));
  if (!eligible) return { completed: false, justCompleted: false };

  progress.completedAt = Date.now();
  const xpGained = awardXp(state.education, `unit:${unitId}:complete`, XP_RULES.unitComplete);
  const achievements = afterProgress(store, bus, { unitId });
  if (bus) bus.emit('unit:completed', { unitId, xpGained });
  return { completed: true, justCompleted: true, xpGained, achievements };
}

export function markSectionRead(store, bus, unitId, sectionId) {
  const state = store.get();
  const unit = getUnit(unitId);
  if (!unit || !unit.implemented) return { ok: false, error: 'error.unitUnavailable' };
  const section = unit.sections.find((s) => s.id === sectionId);
  if (!section) return { ok: false, error: 'error.sectionUnknown' };

  const progress = ensureUnitProgress(state, unitId);
  let xpGained = 0;
  if (!progress.sectionsRead[sectionId]) {
    progress.sectionsRead[sectionId] = true;
    xpGained = awardXp(state.education, `section:${sectionKey(unitId, sectionId)}`, XP_RULES.section);
  }
  const completion = evaluateCompletion(store, bus, unitId);
  const achievements = afterProgress(store, bus, { unitId, sectionId });
  store.update(() => {}, { type: 'education:section', unitId, sectionId });
  if (bus) bus.emit('lesson:sectionRead', { unitId, sectionId });
  return { ok: true, xpGained, completion, achievements };
}

export function recordQuizResult(store, bus, unitId, result, { placement = false } = {}) {
  const state = store.get();
  const unit = getUnit(unitId);
  if (!unit || !unit.implemented) return { ok: false, error: 'error.unitUnavailable' };

  const progress = ensureUnitProgress(state, unitId);
  progress.quizAttempts += 1;
  progress.lastScore = result.score;
  progress.quizBest = Math.max(progress.quizBest || 0, result.score);

  let xpGained = 0;
  if (result.passed) {
    xpGained += awardXp(state.education, `quiz:${unitId}:pass`, XP_RULES.quizPass);
  }
  if (result.score === 100) {
    xpGained += awardXp(state.education, `quiz:${unitId}:perfect`, XP_RULES.quizPerfect);
  }
  if (placement && result.testOutPassed) {
    progress.placedOut = true;
    xpGained += awardXp(state.education, `quiz:${unitId}:testout`, XP_RULES.testOut);
  }

  const completion = evaluateCompletion(store, bus, unitId);
  const achievements = afterProgress(store, bus, { unitId, quiz: true });
  store.update(() => {}, { type: 'education:quiz', unitId });
  if (bus) {
    bus.emit('quiz:recorded', {
      unitId,
      score: result.score,
      passed: result.passed,
      placement,
      testOutPassed: result.testOutPassed,
    });
  }
  return { ok: true, xpGained, completion, achievements, progress };
}

export function recordPracticeCompletion(store, bus, unitId) {
  const state = store.get();
  const unit = getUnit(unitId);
  if (!unit) return { ok: false };
  const progress = ensureUnitProgress(state, unitId);
  if (progress.practiceDone) return { ok: true, already: true };
  progress.practiceDone = true;
  progress.practiceDoneAt = Date.now();
  const xpGained = awardXp(state.education, `practice:${unitId}`, XP_RULES.practice);
  const completion = evaluateCompletion(store, bus, unitId);
  const achievements = afterProgress(store, bus, { unitId, practice: true });
  store.update(() => {}, { type: 'education:practice', unitId });
  if (bus) bus.emit('practice:completed', { unitId, xpGained });
  return { ok: true, xpGained, completion, achievements };
}

export function currentUnit(state) {
  for (const unit of STAGE_1_UNITS) {
    if (!isUnitComplete(state, unit.id)) {
      return unit;
    }
  }
  return null;
}

export function firstUnreadSection(state, unit) {
  if (!unit) return null;
  return unit.sections.find((section) => !isSectionRead(state, unit.id, section.id)) || unit.sections[unit.sections.length - 1];
}

export function overallProgress(state) {
  // Optional professional branches have their own progress and never dilute
  // the core 32-unit completion percentage.
  const implemented = ALL_UNITS.filter((u) => u.implemented && !u.optional);
  const completed = implemented.filter((u) => isUnitComplete(state, u.id)).length;
  return {
    completed,
    total: implemented.length,
    pct: implemented.length ? (completed / implemented.length) * 100 : 0,
  };
}

export function stageProgress(state, stage) {
  const implemented = stage.units.filter((u) => u.implemented);
  const completed = implemented.filter((u) => isUnitComplete(state, u.id)).length;
  return {
    completed,
    total: implemented.length,
    pct: implemented.length ? (completed / implemented.length) * 100 : 0,
  };
}
