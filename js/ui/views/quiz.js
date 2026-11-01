/**
 * Quiz and placement-test view. Session state lives at module scope so a language
 * switch can rebuild the view without losing answers.
 */
import { money, num } from '../../core/format.js';
import { pageHead } from '../kit.js';
import { progressBar, emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { getUnit, nextUnitId } from '../../education/curriculum.js';
import { isUnitUnlocked, unitProgress } from '../../education/lessonEngine.js';
import { buildQuizSession, TEST_OUT_SCORE } from '../../education/quizEngine.js';
import { unitLabel } from '../labels.js';

const sessionCache = new Map();

export function createQuizView(ctx, { unitId, mode = 'quiz' }) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, p) => i18n.t(key, p);
  const unit = getUnit(unitId);
  const placement = mode === 'testout';
  const key = `${unitId}:${mode}`;
  let root;
  let container;
  let data = sessionCache.get(key) || null;

  function ensureSession(state) {
    if (data) return;
    const progress = unitProgress(state, unit);
    const attempt = (progress.quizAttempts || 0) + 1;
    const session = buildQuizSession(unitId, attempt);
    if (!session) {
      data = { error: true };
      return;
    }
    data = { session, answers: {}, current: 0, result: null, record: null };
    sessionCache.set(key, data);
  }

  function paramsFor(question) {
    const kinds = question.paramKinds || {};
    const out = {};
    for (const [name, value] of Object.entries(question.params || {})) {
      const kind = kinds[name] || 'number';
      if (kind === 'money') out[name] = money(value, i18n.locale);
      else if (kind === 'integer') out[name] = num(value, i18n.locale, 0);
      else out[name] = num(value, i18n.locale, 2);
    }
    return out;
  }

  function formatAnswerValue(value, question) {
    if (value === '' || value === null || value === undefined) return t('quiz.noAnswer');
    if (question.type === 'numeric') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return String(value);
      if (question.answerFormat === 'money') return money(numeric, i18n.locale);
      if (question.answerFormat === 'millions') return `${num(numeric, i18n.locale, 1)} ${t('quiz.millionsUnit')}`;
      if (question.answerFormat === 'integer') return num(numeric, i18n.locale, 0);
      return num(numeric, i18n.locale, 2);
    }
    if (Array.isArray(value)) {
      return value.length
        ? value.map((optionKey) => t(optionKey, paramsFor(question))).join(' · ')
        : t('quiz.noAnswer');
    }
    return t(value, paramsFor(question));
  }

  function optionsHtml(question, answers) {
    if (question.type === 'single' || question.type === 'tf') {
      return `<div class="option-list">${question.options.map((option) => {
        const checked = answers[question.id] === option.key;
        return `<label class="option ${checked ? 'is-selected' : ''}">
          <input type="radio" name="q-${question.id}" value="${option.key}" ${checked ? 'checked' : ''} data-option="${option.key}">
          <span class="option__marker"></span>
          <span class="option__text">${t(option.key, paramsFor(question))}</span>
        </label>`;
      }).join('')}</div>`;
    }
    const selected = answers[question.id] || [];
    return `<div class="option-list">${question.options.map((option) => {
      const checked = selected.includes(option.key);
      return `<label class="option option--multi ${checked ? 'is-selected' : ''}">
        <input type="checkbox" name="q-${question.id}" value="${option.key}" ${checked ? 'checked' : ''} data-option="${option.key}">
        <span class="option__marker option__marker--box"></span>
        <span class="option__text">${t(option.key, paramsFor(question))}</span>
      </label>`;
    }).join('')}</div>`;
  }

  function questionHtml(state) {
    const session = data.session;
    const index = data.current;
    const question = session.questions[index];
    const answers = data.answers;
    const progress = ((index + 1) / session.questions.length) * 100;
    return `
      <div class="quiz-page">
        ${pageHead({
          eyebrow: t(placement ? 'quiz.placementEyebrow' : 'quiz.eyebrow', { number: unit.number }),
          title: placement ? t('quiz.placementTitle', { unit: unitLabel(ctx, unit) }) : t('quiz.title'),
          subtitle: placement ? t('quiz.placementSubtitle', { pass: TEST_OUT_SCORE }) : t('quiz.subtitle', { pass: session.passScore }),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}">${t('lesson.backToUnit')}</button>`,
        })}
        <div class="quiz-layout">
          <div class="quiz-main">
            <div class="quiz-progress">
              <div class="quiz-progress__head">
                <span>${t('quiz.questionOf', { index: index + 1, total: session.questions.length })}</span>
                <span class="chip chip--ghost">${t(`quiz.type.${question.type}`)}</span>
              </div>
              ${progressBar(progress, 'accent')}
            </div>
            <article class="quiz-card">
              <h2 class="quiz-question">${t(question.promptKey, paramsFor(question))}</h2>
              ${question.type === 'numeric'
                ? `<div class="numeric-answer">
                    <input class="input input--lg" type="number" step="any" inputmode="decimal" id="numeric-answer"
                      value="${answers[question.id] ?? ''}" placeholder="${t('quiz.numericPlaceholder')}">
                    <span class="numeric-answer__hint">${t(`quiz.unit.${question.answerFormat || 'number'}`)}</span>
                  </div>`
                : optionsHtml(question, answers)}
              <p class="quiz-hint">${t(question.type === 'multi' ? 'quiz.multiHint' : question.type === 'numeric' ? 'quiz.numericHint' : 'quiz.singleHint')}</p>
            </article>
            <footer class="quiz-footer">
              <button class="btn btn--ghost btn--sm" type="button" data-quiz="prev" ${index === 0 ? 'disabled' : ''}>
                ${icon('chevronLeft', { size: 14 })} ${t('common.previous')}
              </button>
              ${index === session.questions.length - 1
                ? `<button class="btn btn--primary btn--sm" type="button" data-quiz="submit">${t('quiz.submit')} ${icon('check', { size: 14 })}</button>`
                : `<button class="btn btn--primary btn--sm" type="button" data-quiz="next">${t('common.next')} ${icon('arrowRight', { size: 14 })}</button>`}
            </footer>
          </div>
          <aside class="quiz-aside">
            <div class="aside-block">
              <span class="field-label">${t('quiz.rulesTitle')}</span>
              <ul class="aside-list">
                <li>${t('quiz.ruleQuestions', { total: session.questions.length })}</li>
                <li>${t('quiz.rulePass', { pass: session.passScore })}</li>
                ${placement ? `<li>${t('quiz.rulePlacement', { pass: TEST_OUT_SCORE })}</li>` : ''}
                <li>${t('quiz.ruleRetry')}</li>
              </ul>
            </div>
            <div class="aside-block">
              <span class="field-label">${t('quiz.dotsTitle')}</span>
              <div class="quiz-dots">
                ${session.questions.map((q, i) => {
                  const answered = q.type === 'multi'
                    ? (data.answers[q.id] || []).length > 0
                    : String(data.answers[q.id] ?? '').trim() !== '';
                  return `<span class="quiz-dot ${i === index ? 'is-current' : ''} ${answered ? 'is-answered' : ''}">${i + 1}</span>`;
                }).join('')}
              </div>
            </div>
            <div class="aside-block aside-block--tip">
              <span class="field-label">${t('quiz.noteLabel')}</span>
              <p class="muted">${t('quiz.noteText')}</p>
            </div>
          </aside>
        </div>
      </div>`;
  }

  function resultsHtml(state) {
    const result = data.result;
    const session = data.session;
    const passed = result.passed;
    const testOutPassed = result.testOutPassed;
    const success = placement ? testOutPassed : passed;
    const nextUnit = unitProgress(state, unit).completed;
    const nextUnitTarget = nextUnitId(unit.id);
    const nextTarget = nextUnit ? (nextUnitTarget ? `/academy/${nextUnitTarget}` : '/academy') : `/academy/${unit.id}/practice`;
    const nextLabel = nextUnit
      ? (nextUnitTarget ? t('quiz.nextUnit') : t('quiz.backToAcademy'))
      : t('quiz.continuePractice');
    const rows = session.questions.map((question, index) => {
      const detail = result.details.find((d) => d.id === question.id);
      const correct = detail?.correct;
      const expected = question.type === 'numeric'
        ? formatAnswerValue(question.answer, question)
        : question.correctIds.map((optionKey) => t(optionKey, paramsFor(question))).join(' · ');
      return `
        <article class="review-card ${correct ? 'is-correct' : 'is-wrong'}">
          <header class="review-card__head">
            <span class="review-card__index">${index + 1}</span>
            <span class="review-card__status">${correct ? icon('check', { size: 13 }) : icon('close', { size: 13 })} ${correct ? t('quiz.correct') : t('quiz.incorrect')}</span>
          </header>
          <h3 class="review-card__question">${t(question.promptKey, paramsFor(question))}</h3>
          <p class="review-card__row"><span>${t('quiz.yourAnswer')}</span><strong>${formatAnswerValue(detail?.given, question)}</strong></p>
          <p class="review-card__row"><span>${t('quiz.correctAnswer')}</span><strong>${expected}</strong></p>
          <div class="callout callout--example">
            <span class="callout__label">${t('quiz.explanation')}</span>
            <p>${t(question.explainKey, paramsFor(question))}</p>
            ${question.workKey ? `<p class="muted">${t(question.workKey, { ...paramsFor(question), answer: expected })}</p>` : ''}
          </div>
        </article>`;
    }).join('');

    return `
      <div class="quiz-page">
        ${pageHead({
          eyebrow: t('quiz.resultsEyebrow'),
          title: t(placement ? 'quiz.placementResultsTitle' : 'quiz.resultsTitle'),
          subtitle: unitLabel(ctx, unit),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}">${t('lesson.backToUnit')}</button>`,
        })}
        <div class="result-banner ${success ? 'is-pass' : 'is-fail'}">
          <div class="score-ring" style="--score:${result.score}">
            <strong>${result.score}%</strong>
            <span>${t('quiz.scoreLabel')}</span>
          </div>
          <div class="result-banner__text">
            <h2>${success ? t(placement ? 'quiz.placementPassed' : 'quiz.passed') : t(placement ? 'quiz.placementFailed' : 'quiz.failed')}</h2>
            <p>${placement
              ? t(success ? 'quiz.placementPassedText' : 'quiz.placementFailedText', { pass: TEST_OUT_SCORE, score: result.score })
              : t(success ? 'quiz.passedText' : 'quiz.failedText', { pass: session.passScore, correct: result.correctCount, total: result.total })}</p>
            ${data.record?.xpGained ? `<span class="pill pill--ok">+${data.record.xpGained} XP</span>` : ''}
            ${nextUnit ? `<span class="pill pill--ok">${icon('check', { size: 12 })} ${t('quiz.unitCompleted')}</span>` : ''}
          </div>
          <div class="result-banner__actions">
            ${success
              ? `<button class="btn btn--primary btn--sm" type="button" data-go="${nextTarget}">${nextLabel}</button>`
              : ''}
            <button class="btn btn--ghost btn--sm" type="button" data-quiz="retry">${icon('refresh', { size: 14 })} ${t('quiz.retry')}</button>
            ${nextUnit && !success
              ? `<button class="btn btn--ghost btn--sm" type="button" data-go="${nextTarget}">${nextLabel}</button>`
              : ''}
          </div>
        </div>
        <div class="review-list">
          <h2 class="section-title">${t('quiz.reviewTitle')}</h2>
          ${rows}
        </div>
      </div>`;
  }

  function handleAnswer(question, event) {
    if (question.type === 'numeric') {
      data.answers[question.id] = event.target.value;
      return;
    }
    if (question.type === 'multi') {
      const selected = new Set(data.answers[question.id] || []);
      if (event.target.checked) selected.add(event.target.value);
      else selected.delete(event.target.value);
      data.answers[question.id] = [...selected];
      const label = event.target.closest('.option');
      if (label) label.classList.toggle('is-selected', event.target.checked);
      return;
    }
    data.answers[question.id] = event.target.value;
    container.querySelectorAll(`input[name="q-${question.id}"]`).forEach((input) => {
      const label = input.closest('.option');
      if (label) label.classList.toggle('is-selected', input.checked);
    });
  }

  function allAnswered() {
    return data.session.questions.every((question) => {
      const answer = data.answers[question.id];
      if (question.type === 'multi') return Array.isArray(answer) && answer.length > 0;
      return String(answer ?? '').trim() !== '';
    });
  }

  function submit() {
    if (!allAnswered()) {
      ctx.toast(t('quiz.answerAll'), 'warning');
      return;
    }
    const outcome = actions.submitQuiz(unitId, data.session, data.answers, { placement });
    if (!outcome) return;
    data.result = outcome.result;
    data.record = outcome.record;
    sessionCache.set(key, data);
    render(store.get());
  }

  function bind(state) {
    const question = data?.session?.questions?.[data.current];
    container.querySelectorAll('[data-option]').forEach((input) => {
      input.addEventListener('change', (event) => handleAnswer(question, event));
    });
    const numeric = container.querySelector('#numeric-answer');
    if (numeric && question) {
      numeric.addEventListener('input', (event) => handleAnswer(question, event));
    }
    container.querySelectorAll('[data-quiz]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.quiz;
        if (action === 'prev' && data.current > 0) {
          data.current -= 1;
          render(state);
        } else if (action === 'next' && data.current < data.session.questions.length - 1) {
          if (!allAnsweredCurrent(question)) {
            ctx.toast(t('quiz.answerThis'), 'warning');
            return;
          }
          data.current += 1;
          render(state);
        } else if (action === 'submit') {
          submit();
        } else if (action === 'retry') {
          sessionCache.delete(key);
          data = null;
          render(state);
        }
      });
    });
    container.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => router.go(button.dataset.go));
    });
  }

  function allAnsweredCurrent(question) {
    if (!question) return false;
    const answer = data.answers[question.id];
    if (question.type === 'multi') return Array.isArray(answer) && answer.length > 0;
    return String(answer ?? '').trim() !== '';
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    if (!unit || !unit.implemented) {
      container.innerHTML = `<div class="quiz-page">${pageHead({ title: t('academy.unitUnavailable') })}${emptyState(icon('lock', { size: 24 }), t('academy.unitUnavailable'), t('academy.unitUnavailableText'), `<button class="btn btn--primary btn--sm" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`)}</div>`;
      return;
    }
    if (!isUnitUnlocked(state, unit)) {
      container.innerHTML = `<div class="quiz-page">${pageHead({ title: unitLabel(ctx, unit) })}${emptyState(icon('lock', { size: 24 }), t('lesson.lockedTitle'), t('quiz.lockedText'), `<button class="btn btn--primary btn--sm" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`)}</div>`;
      return;
    }
    ensureSession(state);
    if (data?.error) {
      container.innerHTML = `<div class="quiz-page">${pageHead({ title: t('quiz.title') })}${emptyState('!', t('quiz.unavailable'), t('quiz.unavailableText'), '')}</div>`;
      return;
    }
    container.innerHTML = data.result ? resultsHtml(state) : questionHtml(state);
    bind(state);
  }

  function destroy() {
    // session cache intentionally survives navigation and language switches.
  }

  return { mount, render, destroy };
}
