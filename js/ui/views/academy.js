/**
 * Academy: the learning path, stage map and unit cards.
 */
import { num } from '../../core/format.js';
import { pageHead } from '../kit.js';
import { progressBar } from '../dom.js';
import { icon } from '../icons.js';
import {
  unitProgress, isUnitComplete, isUnitUnlocked, stageProgress, overallProgress,
} from '../../education/lessonEngine.js';
import { STAGES, STAGE_1_UNITS, getUnit } from '../../education/curriculum.js';
import { levelInfo, ACHIEVEMENTS } from '../../education/progress.js';
import { openModal } from '../components.js';
import { unitLabel, unitSummary, stageLabel, stageSummary } from '../labels.js';

export function createAcademyView(ctx) {
  const { i18n, store, router } = ctx;
  let root;
  let container;

  const t = (key, params) => i18n.t(key, params);

  function unitCard(unit, state) {
    if (!unit.implemented) {
      return `
        <article class="unit-card is-locked">
          <header class="unit-card__head">
            <span class="unit-number">${unit.number}</span>
            <div class="unit-card__titles">
              <h3 class="unit-card__title">${unitLabel(ctx, unit)}</h3>
              <p class="unit-card__summary">${unitSummary(ctx, unit)}</p>
            </div>
            <span class="pill pill--planned">${icon('lock', { size: 12 })} ${t('academy.phaseBadge', { phase: 2 })}</span>
          </header>
          <div class="unit-card__progress"><p class="muted">${t('academy.unitPlannedText')}</p></div>
        </article>`;
    }
    const unlocked = isUnitUnlocked(state, unit);
    const progress = unitProgress(state, unit);
    const completed = progress.completed;
    const active = !completed && (progress.read > 0 || progress.quizAttempts > 0);
    const prerequisiteUnit = (unit.prerequisites || [])[0];
    const nextTarget = progress.read < progress.total
      ? `/academy/${unit.id}/s${progress.read + 1}`
      : `/academy/${unit.id}/practice`;

    const actions = unlocked
      ? `
        <button class="btn btn--primary btn--sm" type="button" data-unit-start="${unit.id}" data-target="${completed ? `/academy/${unit.id}` : nextTarget}">
          ${completed ? t('academy.review') : active ? t('academy.continue') : t('academy.start')}
        </button>
        <button class="btn btn--ghost btn--sm" type="button" data-unit-quiz="${unit.id}">${t('academy.quiz')}</button>
        ${!completed ? `<button class="btn btn--ghost btn--sm" type="button" data-unit-testout="${unit.id}">${t('academy.testOut')}</button>` : ''}
      `
      : `<span class="locked-note">${icon('lock', { size: 14 })} ${t('academy.lockedByUnit', { unit: prerequisiteUnit ? unitLabel(ctx, getUnit(prerequisiteUnit)) : '' })}</span>`;

    return `
      <article class="unit-card ${completed ? 'is-complete' : active ? 'is-active' : ''} ${unlocked ? '' : 'is-locked'}">
        <header class="unit-card__head">
          <span class="unit-number">${unit.number}</span>
          <div class="unit-card__titles">
            <h3 class="unit-card__title">${unitLabel(ctx, unit)}</h3>
            <p class="unit-card__summary">${unitSummary(ctx, unit)}</p>
          </div>
          ${completed ? `<span class="unit-card__done">${icon('check', { size: 14 })} ${t('academy.completed')}</span>` : unlocked ? `<span class="unit-card__meta">${t('academy.minutes', { minutes: unit.minutes })}</span>` : ''}
        </header>
        <div class="unit-card__progress">
          ${progressBar(progress.pct, completed ? 'up' : 'accent')}
          <div class="unit-card__checks">
            <span class="check-line ${progress.allRead || progress.placedOut ? 'is-done' : ''}">${icon('check', { size: 12 })} ${progress.placedOut ? t('academy.placementPassed') : t('academy.checkSections', { read: progress.read, total: progress.total })}</span>
            <span class="check-line ${progress.practiceDone || progress.placedOut ? 'is-done' : ''}">${icon('check', { size: 12 })} ${progress.placedOut ? t('academy.placementWaived') : t('academy.checkPractice')}</span>
            <span class="check-line ${progress.quizPassed ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkQuiz')}${progress.quizBest ? ` · ${progress.quizBest}%` : ''}</span>
          </div>
        </div>
        <footer class="unit-card__actions">${actions}</footer>
      </article>`;
  }

  function stageBlock(stage, state) {
    const progress = stageProgress(state, stage);
    const planned = !stage.implemented;
    return `
      <section class="stage-block ${planned ? 'is-planned' : ''}" id="stage-${stage.id}">
        <header class="stage-head" ${planned ? `data-stage-open="${stage.id}"` : ''}>
          <span class="stage-number">${stage.number}</span>
          <div class="stage-head__text">
            <h2 class="stage-title">${stageLabel(ctx, stage)}</h2>
            <p class="stage-summary">${stageSummary(ctx, stage)}</p>
          </div>
          ${planned
            ? `<span class="pill pill--planned">${icon('lock', { size: 12 })} ${t('academy.phaseBadge', { phase: stage.phase })}</span>`
            : `<div class="stage-progress"><span class="muted">${t('academy.stageProgress', { done: progress.completed, total: progress.total })}</span>${progressBar(progress.pct)}</div>`}
        </header>
        ${planned
          ? `<div class="planned-units">${stage.units.map((unit) => `<span class="planned-unit"><span>${unit.number}</span>${unitLabel(ctx, unit)}</span>`).join('')}</div>`
          : `<div class="unit-grid">${stage.units.map((unit) => unitCard(unit, state)).join('')}</div>`}
      </section>`;
  }

  function template(state) {
    const level = levelInfo(state.education.xp || 0);
    const overall = overallProgress(state);
    const earned = ACHIEVEMENTS.filter((a) => state.education.achievements.includes(a.id));
    const stageOneDone = STAGE_1_UNITS.every((unit) => isUnitComplete(state, unit.id));

    return `
      <div class="academy">
        ${pageHead({
          eyebrow: t('academy.eyebrow'),
          title: t('academy.title'),
          subtitle: t('academy.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/roadmap">${icon('roadmap', { size: 15 })} ${t('academy.roadmap')}</button>`,
        })}
        <div class="academy-banner">
          <div class="academy-banner__level">
            <span class="academy-banner__label">${t('shell.level')}</span>
            <strong>${level.level}</strong>
            <span class="muted">${num(level.xp, i18n.locale, 0)} XP</span>
          </div>
          <div class="academy-banner__progress">
            <div class="academy-banner__row"><span>${t('academy.overall')}</span><span>${Math.round(overall.pct)}%</span></div>
            ${progressBar(overall.pct, 'accent')}
            <div class="academy-banner__meta">${t('academy.overallMeta', { done: overall.completed, total: overall.total })}</div>
          </div>
          <div class="academy-banner__achievements">
            <span class="academy-banner__label">${t('dashboard.achievementsTitle')}</span>
            <strong>${earned.length} / ${ACHIEVEMENTS.length}</strong>
            <div class="achievement-mini">${earned.slice(0, 5).map((a) => `<span title="${t(a.descKey)}">${icon('sparkle', { size: 14 })}</span>`).join('')}</div>
          </div>
        </div>

        ${stageOneDone ? `
        <div class="completion-banner">
          <span class="completion-banner__icon">${icon('sparkle', { size: 22 })}</span>
          <div>
            <h2>${t('academy.stageOneDoneTitle')}</h2>
            <p>${t('academy.stageOneDoneText')}</p>
            <p class="muted">${t('academy.stageOneDoneNote')}</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" data-go="/roadmap">${t('academy.whatsNext')}</button>
        </div>` : ''}

        <div class="academy-layout">
          <aside class="academy-toc">
            <span class="field-label">${t('academy.stages')}</span>
            ${STAGES.map((stage) => `
              <button class="toc-item ${stage.implemented ? 'is-live' : ''}" type="button" data-scroll="stage-${stage.id}">
                <span class="toc-item__number">${stage.number}</span>
                <span class="toc-item__text">${stageLabel(ctx, stage)}</span>
                ${stage.implemented ? `<span class="toc-item__dot"></span>` : icon('lock', { size: 12 })}
              </button>`).join('')}
          </aside>
          <div class="academy-stages">
            ${STAGES.map((stage) => stageBlock(stage, state)).join('')}
          </div>
        </div>
      </div>`;
  }

  function openStageModal(stageId) {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) return;
    openModal({
      title: stageLabel(ctx, stage),
      subtitle: t('academy.phaseBadge', { phase: stage.phase }),
      bodyHtml: `
        <p class="modal-copy">${stageSummary(ctx, stage)}</p>
        <div class="planned-list">${stage.units.map((unit) => `
          <div class="planned-list__row"><span class="unit-number unit-number--sm">${unit.number}</span><span>${unitLabel(ctx, unit)}</span></div>`).join('')}
        </div>
        <div class="callout callout--warning">
          <span class="callout__label">${t('academy.notBuilt')}</span>
          <p>${t('academy.notBuiltText', { phase: stage.phase })}</p>
        </div>`,
      footerHtml: `<button class="btn btn--primary" type="button" data-modal-close="true">${t('common.gotIt')}</button>`,
    });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const start = event.target.closest('[data-unit-start]');
      if (start) {
        router.go(start.dataset.target);
        return;
      }
      const quiz = event.target.closest('[data-unit-quiz]');
      if (quiz) {
        router.go(`/academy/${quiz.dataset.unitQuiz}/quiz`);
        return;
      }
      const testout = event.target.closest('[data-unit-testout]');
      if (testout) {
        router.go(`/academy/${testout.dataset.unitTestout}/testout`);
        return;
      }
      const go = event.target.closest('[data-go]');
      if (go) {
        router.go(go.dataset.go);
        return;
      }
      const scroll = event.target.closest('[data-scroll]');
      if (scroll) {
        const target = container.querySelector(`#${scroll.dataset.scroll}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const stage = event.target.closest('[data-stage-open]');
      if (stage) openStageModal(stage.dataset.stageOpen);
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
