/**
 * Practice view: shows a task that is verified automatically from real actions.
 */
import { pageHead, card } from '../kit.js';
import { progressBar, emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { getUnit } from '../../education/curriculum.js';
import { isUnitUnlocked, unitProgress } from '../../education/lessonEngine.js';
import { evaluatePractice } from '../../education/practiceEngine.js';
import { unitLabel } from '../labels.js';

export function createPracticeView(ctx, { unitId }) {
  const { i18n, store, router } = ctx;
  const t = (key, p) => i18n.t(key, p);
  const unit = getUnit(unitId);
  let root;
  let container;

  function template(state) {
    const progress = unitProgress(state, unit);
    const result = evaluatePractice(state, unit);
    const task = unit.practice;
    const done = progress.practiceDone || result.done;
    const resting = result.resting;
    return `
      <div class="practice-page">
        ${pageHead({
          eyebrow: t('practice.eyebrow', { number: unit.number }),
          title: t('practice.title'),
          subtitle: unitLabel(ctx, unit),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}">${t('lesson.backToUnit')}</button>`,
        })}
        <div class="practice-layout">
          <div class="practice-main">
            ${card({
              className: `task-card ${done ? 'is-done' : ''}`,
              body: `
                <div class="task-card__head">
                  <span class="task-card__icon">${done ? icon('check', { size: 22 }) : icon('challenges', { size: 22 })}</span>
                  <div>
                    <h2 class="task-card__title">${t(task.titleKey)}</h2>
                    <p class="task-card__requirement">${t(task.requirementKey)}</p>
                  </div>
                  <span class="pill ${done ? 'pill--ok' : 'pill--warn'}">${done ? t('practice.done') : t('practice.notDone')}</span>
                </div>
                <div class="task-progress">
                  ${progressBar(result.target ? (result.current / result.target) * 100 : 0, done ? 'up' : 'accent', false)}
                  <span class="muted">${t('practice.progress', { current: result.current, target: result.target })}</span>
                </div>
                ${!done ? `
                  <div class="task-actions">
                    <button class="btn btn--primary btn--sm" type="button" data-go="${task.actionHref}">${t(task.actionKey)}</button>
                    <span class="muted">${t('practice.autoHint')}</span>
                  </div>` : `
                  <div class="task-actions">
                    <button class="btn btn--primary btn--sm" type="button" data-go="/academy/${unit.id}/quiz">${t('practice.goQuiz')}</button>
                    <button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}">${t('lesson.backToUnit')}</button>
                  </div>`}
                ${resting ? `<div class="callout callout--tip"><span class="callout__label">${t('practice.restingLabel')}</span><p>${t('practice.restingText')}</p></div>` : ''}
                <div class="callout callout--tip">
                  <span class="callout__label">${t('practice.hintLabel')}</span>
                  <p>${t(task.hintKey)}</p>
                </div>`,
            })}
          </div>
          <aside class="practice-aside">
            <div class="aside-block">
              <span class="field-label">${t('practice.verifyTitle')}</span>
              <ul class="aside-list">
                <li>${t('practice.verifyAuto')}</li>
                <li>${t('practice.verifyNoButton')}</li>
                <li>${t('practice.verifyAccount')}</li>
              </ul>
            </div>
            <div class="aside-block">
              <span class="field-label">${t('practice.unitStatus')}</span>
              <div class="aside-checks">
                <span class="check-line ${progress.allRead ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkSections', { read: progress.read, total: progress.total })}</span>
                <span class="check-line ${done ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkPractice')}</span>
                <span class="check-line ${progress.quizPassed ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkQuiz')}</span>
              </div>
            </div>
            <div class="aside-block aside-block--tip">
              <span class="field-label">${t('practice.rewardLabel')}</span>
              <p class="muted">${t('practice.rewardText', { xp: 25 })}</p>
            </div>
          </aside>
        </div>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) router.go(go.dataset.go);
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    if (!unit || !unit.implemented) {
      container.innerHTML = `<div class="practice-page">${pageHead({ title: t('practice.title') })}${emptyState(icon('lock', { size: 24 }), t('academy.unitUnavailable'), t('academy.unitUnavailableText'), `<button class="btn btn--primary btn--sm" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`)}</div>`;
      return;
    }
    if (!isUnitUnlocked(state, unit)) {
      container.innerHTML = `<div class="practice-page">${pageHead({ title: t('practice.title') })}${emptyState(icon('lock', { size: 24 }), t('lesson.lockedTitle'), t('practice.lockedText'), `<button class="btn btn--primary btn--sm" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`)}</div>`;
      return;
    }
    container.innerHTML = template(state);
  }

  function destroy() {}

  return { mount, render, destroy };
}
