/**
 * Professional branches: six optional courses unlocked after the core 32 units.
 * Each branch is one focused unit with four lessons, a practice task and a quiz.
 */
import { num } from '../../core/format.js';
import { pageHead, card } from '../kit.js';
import { progressBar } from '../dom.js';
import { icon } from '../icons.js';
import { BRANCHES, getUnit } from '../../education/curriculum.js';
import {
  unitProgress, isUnitUnlocked, isUnitComplete,
} from '../../education/lessonEngine.js';

export function createBranchesView(ctx) {
  const { i18n, store, router } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;

  const coreDone = (state) => isUnitComplete(state, 'u32');

  function branchCard(branch, index, state) {
    const unit = getUnit(branch.unitId);
    if (!unit) return '';
    const unlocked = isUnitUnlocked(state, unit);
    const progress = unitProgress(state, unit);
    const completed = progress.completed;
    const active = !completed && (progress.read > 0 || progress.quizAttempts > 0 || progress.practiceDone);
    const nextTarget = progress.read < progress.total
      ? `/academy/${unit.id}/s${progress.read + 1}`
      : `/academy/${unit.id}/practice`;

    return `
      <article class="branch-card ${completed ? 'is-complete' : active ? 'is-active' : ''} ${unlocked ? '' : 'is-locked'}">
        <header class="branch-card__head">
          <span class="branch-card__code">B${index + 1}</span>
          <div class="branch-card__titles">
            <h2 class="branch-card__title">${t(branch.nameKey)}</h2>
            <p class="branch-card__desc">${t(branch.descKey)}</p>
          </div>
          ${completed
            ? `<span class="unit-card__done">${icon('check', { size: 14 })} ${t('academy.completed')}</span>`
            : unlocked
              ? `<span class="unit-card__meta">${t('academy.minutes', { minutes: unit.minutes })}</span>`
              : `<span class="pill pill--planned">${icon('lock', { size: 12 })} ${t('branches.lockedPill')}</span>`}
        </header>
        <div class="branch-card__meta">
          <span>${t('branches.career')}</span>
          <strong>${t(branch.careerKey)}</strong>
        </div>
        <div class="branch-card__body">
          <div>
            <span class="field-label">${t('branches.lessons')}</span>
            <ol class="branch-lessons">
              ${unit.sections.map((section) => `<li>${t(section.titleKey)}</li>`).join('')}
            </ol>
          </div>
          <div>
            <span class="field-label">${t('branches.outcomeLabel')}</span>
            <p class="muted">${t(branch.outcomeKey)}</p>
          </div>
        </div>
        <div class="branch-card__progress">
          ${progressBar(progress.pct, completed ? 'up' : 'accent')}
          <div class="unit-card__checks">
            <span class="check-line ${progress.allRead ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkSections', { read: progress.read, total: progress.total })}</span>
            <span class="check-line ${progress.practiceDone ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkPractice')}</span>
            <span class="check-line ${progress.quizPassed ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkQuiz')}${progress.quizBest ? ` · ${num(progress.quizBest, i18n.locale, 0)}%` : ''}</span>
          </div>
        </div>
        <footer class="branch-card__actions">
          ${unlocked
            ? `
              <button class="btn btn--primary btn--sm" type="button" data-branch-go="${completed ? `/academy/${unit.id}` : nextTarget}">
                ${completed ? t('branches.review') : active ? t('branches.continue') : t('branches.start')}
              </button>
              <button class="btn btn--ghost btn--sm" type="button" data-branch-go="/academy/${unit.id}/quiz">${t('branches.quiz')}</button>
              <button class="btn btn--ghost btn--sm" type="button" data-branch-go="/academy/${unit.id}/practice">${t('branches.practice')}</button>`
            : `<button class="btn btn--ghost btn--sm" type="button" data-branch-go="/academy/u32">${t('branches.goCore')}</button>`}
        </footer>
      </article>`;
  }

  function template(state) {
    const done = coreDone(state);
    return `
      <div class="branches-page">
        ${pageHead({
          eyebrow: t('academy.eyebrow'),
          title: t('branches.title'),
          subtitle: t('branches.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-branch-go="/academy">${icon('academy', { size: 15 })} ${t('branches.backAcademy')}</button>`,
        })}
        ${done ? '' : card({
          title: t('branches.lockedTitle'),
          subtitle: t('branches.lockedSubtitle'),
          body: `<p class="muted">${t('branches.lockedText')}</p>
            <button class="btn btn--primary btn--sm" type="button" data-branch-go="/academy/u32">${t('branches.goCore')}</button>`,
        })}
        <div class="branch-grid">
          ${BRANCHES.map((branch, index) => branchCard(branch, index, state)).join('')}
        </div>
        <p class="chart-note muted">${t('branches.note')}</p>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const go = event.target.closest('[data-branch-go]');
      if (go) router.go(go.dataset.branchGo);
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
  }

  function destroy() {
    // no dynamic resources
  }

  return { mount, render, destroy };
}
