/**
 * Lesson view: unit overview and individual lesson sections with interactive demos.
 */
import { pageHead, card } from '../kit.js';
import { progressBar, emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { openTermModal, termName } from '../components.js';
import { mountDemo } from '../demos.js';
import {
  getUnit, getSection,
} from '../../education/curriculum.js';
import { isSectionRead, isUnitUnlocked, unitProgress } from '../../education/lessonEngine.js';
import { GLOSSARY_TERMS, getGlossaryTerm, termKey } from '../../education/glossary.js';
import { TOOL_DEFS, isToolUnlocked } from '../../education/unlockManager.js';
import { unitLabel, unitSummary } from '../labels.js';

function renderList(block, t) {
  const marker = block.variant === 'number'
    ? (index) => `<span class="list-marker list-marker--number">${index + 1}</span>`
    : (index) => `<span class="list-marker">${block.variant === 'check' ? icon('check', { size: 12 }) : '·'}</span>`;
  return `
    <div class="lesson-list">
      ${block.titleKey ? `<h4 class="lesson-list__title">${t(block.titleKey)}</h4>` : ''}
      <ul class="lesson-list__items">
        ${block.items.map((key, index) => `<li>${marker(index)}<span>${t(key)}</span></li>`).join('')}
      </ul>
    </div>`;
}

function renderBlock(block, ctx) {
  const t = (key, params) => ctx.i18n.t(key, params);
  const locale = ctx.i18n.locale;
  switch (block.type) {
    case 'p':
      return `<p class="lesson-p">${t(block.key)}</p>`;
    case 'list':
      return renderList(block, t);
    case 'callout': {
      const inner = `<p>${t(block.key)}</p>`;
      if (block.variant === 'pro') {
        return `
          <details class="pro-block">
            <summary><span class="pro-block__tag">${t('lesson.proTag')}</span>${t(block.titleKey)}</summary>
            <div class="pro-block__body">${inner}</div>
          </details>`;
      }
      return `
        <div class="callout callout--${block.variant}">
          <span class="callout__label">${t(block.titleKey)}</span>
          ${inner}
        </div>`;
    }
    case 'formula':
      return `
        <div class="formula-box">
          <div class="formula-box__expr">${t(block.key)}</div>
          ${block.noteKey ? `<div class="formula-box__note">${t(block.noteKey)}</div>` : ''}
        </div>`;
    case 'example':
      return `
        <div class="callout callout--example">
          <span class="callout__label">${t(block.titleKey)}</span>
          ${block.lines.map((key) => `<p>${t(key)}</p>`).join('')}
        </div>`;
    case 'term': {
      const term = getGlossaryTerm(block.termId);
      if (!term) return '';
      const other = ctx.i18n.otherLocale();
      const name = termName(block.termId, locale);
      const otherName = ctx.i18n.translate(other, termKey(block.termId, 'name'));
      return `<button class="term-chip" type="button" data-term="${block.termId}">
        <span class="term-chip__icon">${icon('glossary', { size: 14 })}</span>
        <span class="term-chip__name">${name}</span>
        <span class="term-chip__alt">${otherName}</span>
      </button>`;
    }
    case 'demo':
      return `<div class="demo-slot" data-demo="${block.id}"></div>`;
    case 'table':
      return `
        <div class="table-wrap">
          <table class="table table--compact">
            <thead><tr>${block.headKeys.map((key) => `<th>${t(key)}</th>`).join('')}</tr></thead>
            <tbody>${block.rows.map((row) => `<tr>${row.map((key) => `<td>${t(key)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>`;
    default:
      return '';
  }
}

function sectionTerms(section) {
  return section.blocks.filter((block) => block.type === 'term').map((block) => block.termId);
}

export function createLessonView(ctx, params) {
  const { i18n, store, router, actions } = ctx;
  const unitId = params.unitId || 'u1';
  const sectionId = params.sectionId || null;
  let root;
  let container;
  let demoCleanups = [];

  const t = (key, p) => i18n.t(key, p);
  const unit = getUnit(unitId);
  const section = sectionId ? getSection(unitId, sectionId) : null;

  function lockedPage(reasonHtml) {
    return `
      <div class="lesson-page">
        ${pageHead({ eyebrow: t('lesson.eyebrow'), title: unit ? unitLabel(ctx, unit) : unitId })}
        ${card({
          className: 'locked-card',
          body: `
            <div class="locked-card__icon">${icon('lock', { size: 26 })}</div>
            <h2>${t('lesson.lockedTitle')}</h2>
            <p>${reasonHtml}</p>
            <button class="btn btn--primary" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`,
        })}
      </div>`;
  }

  function outline(state) {
    if (!unit) return '';
    const progress = unitProgress(state, unit);
    const rows = unit.sections.map((sec, index) => {
      const read = isSectionRead(state, unit.id, sec.id);
      const active = sectionId === sec.id;
      return `
        <a class="outline-item ${active ? 'is-active' : ''} ${read ? 'is-read' : ''}" href="#/academy/${unit.id}/${sec.id}">
          <span class="outline-item__marker">${read ? icon('check', { size: 12 }) : index + 1}</span>
          <span class="outline-item__title">${t(sec.titleKey)}</span>
        </a>`;
    }).join('');
    return `
      <span class="field-label">${t('lesson.outline')}</span>
      <nav class="outline">${rows}</nav>
      <div class="outline-divider"></div>
      <a class="outline-item outline-item--link ${progress.practiceDone ? 'is-read' : ''}" href="#/academy/${unit.id}/practice">
        <span class="outline-item__marker">${progress.practiceDone ? icon('check', { size: 12 }) : 'P'}</span>
        <span class="outline-item__title">${t('lesson.practiceLink')}</span>
      </a>
      <a class="outline-item outline-item--link ${progress.quizPassed ? 'is-read' : ''}" href="#/academy/${unit.id}/quiz">
        <span class="outline-item__marker">${progress.quizPassed ? icon('check', { size: 12 }) : 'Q'}</span>
        <span class="outline-item__title">${t('lesson.quizLink')}</span>
      </a>`;
  }

  function aside(state) {
    if (!unit) return '';
    const progress = unitProgress(state, unit);
    const terms = section ? sectionTerms(section) : GLOSSARY_TERMS.filter((term) => term.unitId === unit.id).map((term) => term.id);
    const unique = [...new Set(terms)];
    return `
      <div class="aside-block">
        <span class="field-label">${t('lesson.progress')}</span>
        <div class="aside-progress">
          ${progressBar(progress.pct, 'accent', true)}
          <span class="muted">${t('lesson.progressMeta', { read: progress.read, total: progress.total })}</span>
        </div>
      </div>
      ${unique.length ? `
      <div class="aside-block">
        <span class="field-label">${t('lesson.keyTerms')}</span>
        <div class="aside-terms">
          ${unique.map((id) => `<button class="term-chip term-chip--sm" type="button" data-term="${id}">${termName(id, i18n.locale)}</button>`).join('')}
        </div>
      </div>` : ''}
      <div class="aside-block">
        <span class="field-label">${t('lesson.howItWorks')}</span>
        <ul class="aside-list">
          <li>${t('lesson.howLearn')}</li>
          <li>${t('lesson.howDemo')}</li>
          <li>${t('lesson.howPractice')}</li>
          <li>${t('lesson.howTest')}</li>
        </ul>
      </div>
      <div class="aside-block aside-block--tip">
        <span class="field-label">${t('lesson.tipLabel')}</span>
        <p class="muted">${t('lesson.tipText')}</p>
      </div>`;
  }

  function overviewTemplate(state) {
    const progress = unitProgress(state, unit);
    const nextSection = unit.sections.find((sec) => !isSectionRead(state, unit.id, sec.id));
    const target = progress.completed
      ? `/academy/${unit.id}/${unit.sections[0].id}`
      : nextSection ? `/academy/${unit.id}/${nextSection.id}` : `/academy/${unit.id}/practice`;
    const unlockTools = unit.unlocks || [];
    return `
      <div class="lesson-page">
        ${pageHead({
          eyebrow: t('lesson.eyebrow') + ' · ' + t('lesson.unitNumber', { number: unit.number }),
          title: unitLabel(ctx, unit),
          subtitle: unitSummary(ctx, unit),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`,
        })}
        <div class="lesson-overview">
          <div class="lesson-overview__main">
            ${card({
              title: t('lesson.whatYouLearn'),
              body: `<ol class="overview-sections">${unit.sections.map((sec, index) => `
                <li>
                  <a href="#/academy/${unit.id}/${sec.id}" class="overview-section">
                    <span class="overview-section__number">${index + 1}</span>
                    <span class="overview-section__title">${t(sec.titleKey)}</span>
                    ${isSectionRead(state, unit.id, sec.id) ? `<span class="overview-section__done">${icon('check', { size: 13 })}</span>` : ''}
                  </a>
                </li>`).join('')}</ol>`,
            })}
            ${card({
              className: 'practice-preview',
              title: t('lesson.practiceTitle'),
              subtitle: t(unit.practice.requirementKey),
              actions: `<span class="pill ${progress.practiceDone ? 'pill--ok' : ''}">${progress.practiceDone ? t('practice.done') : t('practice.notDone')}</span>`,
              body: `<div class="preview-actions">
                <button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}/practice">${t('practice.open')}</button>
              </div>`,
            })}
            ${card({
              className: 'quiz-preview',
              title: t('quiz.cardTitle'),
              subtitle: t('quiz.cardSubtitle', { pass: 80 }),
              actions: `<span class="pill ${progress.quizPassed ? 'pill--ok' : ''}">${progress.quizBest ? t('quiz.bestScore', { score: progress.quizBest }) : t('quiz.notAttempted')}</span>`,
              body: `<div class="preview-actions">
                <button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}/quiz">${t('quiz.start')}</button>
                <button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${unit.id}/testout">${t('academy.testOut')}</button>
              </div>`,
            })}
          </div>
          <aside class="lesson-aside">
            <div class="aside-block">
              <span class="field-label">${t('lesson.progress')}</span>
              ${progressBar(progress.pct, 'accent', true)}
              <div class="aside-checks">
                <span class="check-line ${progress.allRead || progress.placedOut ? 'is-done' : ''}">${icon('check', { size: 12 })} ${progress.placedOut ? t('academy.placementPassed') : t('academy.checkSections', { read: progress.read, total: progress.total })}</span>
                <span class="check-line ${progress.practiceDone || progress.placedOut ? 'is-done' : ''}">${icon('check', { size: 12 })} ${progress.placedOut ? t('academy.placementWaived') : t('academy.checkPractice')}</span>
                <span class="check-line ${progress.quizPassed ? 'is-done' : ''}">${icon('check', { size: 12 })} ${t('academy.checkQuiz')}</span>
              </div>
            </div>
            ${unlockTools.length ? `
            <div class="aside-block">
              <span class="field-label">${t('lesson.unlocks')}</span>
              ${unlockTools.map((toolId) => {
                const def = TOOL_DEFS[toolId];
                if (!def) return '';
                const unlocked = isToolUnlocked(state, toolId);
                return `<div class="unlock-line ${unlocked ? 'is-unlocked' : ''}">${icon(unlocked ? 'check' : 'lock', { size: 13 })} <span>${t(def.titleKey)}${unlocked ? ` · ${t('unlock.unlockedLabel')}` : ''}</span></div>`;
              }).join('')}
              <p class="muted">${t('lesson.unlockNote')}</p>
            </div>` : ''}
            <div class="aside-block">
              <span class="field-label">${t('lesson.unitMeta')}</span>
              <span class="muted">${t('academy.minutes', { minutes: unit.minutes })}</span>
            </div>
            <button class="btn btn--primary btn--block" type="button" data-go="${target}">${icon('play', { size: 14 })} ${progress.completed ? t('academy.review') : nextSection ? t('academy.continue') : t('lesson.goPractice')}</button>
          </aside>
        </div>
      </div>`;
  }

  function sectionTemplate(state) {
    const index = unit.sections.findIndex((sec) => sec.id === section.id);
    const prev = index > 0 ? unit.sections[index - 1] : null;
    const next = index < unit.sections.length - 1 ? unit.sections[index + 1] : null;
    const read = isSectionRead(state, unit.id, section.id);
    const progress = unitProgress(state, unit);

    return `
      <div class="lesson-page">
        <div class="lesson-topbar">
          <a class="back-link" href="#/academy/${unit.id}">${icon('chevronLeft', { size: 15 })} ${t('lesson.backToUnit')}</a>
          <span class="lesson-topbar__meta">${t('lesson.unitNumber', { number: unit.number })} · ${t('lesson.sectionOf', { index: index + 1, total: unit.sections.length })}</span>
        </div>
        <div class="lesson-layout">
          <aside class="lesson-outline">${outline(state)}</aside>
          <article class="lesson-content">
            <header class="lesson-content__head">
              <span class="eyebrow">${t('lesson.sectionEyebrow', { index: index + 1, total: unit.sections.length })}</span>
              <h1 class="lesson-title">${t(section.titleKey)}</h1>
              <div class="lesson-content__meta">
                <span>${t('lesson.xpPerSection', { xp: 5 })}</span>
                ${read ? `<span class="check-line is-done">${icon('check', { size: 12 })} ${t('lesson.read')}</span>` : ''}
              </div>
            </header>
            <div class="lesson-blocks">
              ${section.blocks.map((block) => renderBlock(block, ctx)).join('')}
            </div>
            <footer class="lesson-footer">
              <div class="lesson-footer__nav">
                ${prev ? `<a class="btn btn--ghost btn--sm" href="#/academy/${unit.id}/${prev.id}">${icon('chevronLeft', { size: 14 })} ${t('common.previous')}</a>` : '<span></span>'}
                ${next
                  ? `<button class="btn btn--primary btn--sm" type="button" data-next="${unit.id}|${section.id}|${next.id}">${t('lesson.markNext')} ${icon('arrowRight', { size: 14 })}</button>`
                  : `<button class="btn btn--primary btn--sm" type="button" data-finish="${unit.id}|${section.id}">${read ? t('lesson.goPractice') : t('lesson.completeSection')} ${icon('check', { size: 14 })}</button>`}
              </div>
              <div class="lesson-footer__progress">
                ${progressBar(((index + 1) / unit.sections.length) * 100, 'accent')}
              </div>
            </footer>
          </article>
          <aside class="lesson-aside">${aside(state)}</aside>
        </div>
      </div>`;
  }

  function render(state) {
    if (!container) return;
    if (!unit || (sectionId && !section)) {
      container.innerHTML = `<div class="lesson-page">${pageHead({ title: t('academy.unitUnavailable') })}${emptyState(icon('lock', { size: 24 }), t('academy.unitUnavailable'), t('academy.unitUnavailableText'), `<button class="btn btn--primary btn--sm" type="button" data-go="/academy">${t('lesson.backToAcademy')}</button>`)}</div>`;
      attachCommon();
      return;
    }
    if (!unit.implemented) {
      container.innerHTML = lockedPage(t('academy.unitPlannedText'));
      attachCommon();
      return;
    }
    if (!isUnitUnlocked(state, unit)) {
      const prereq = (unit.prerequisites || [])[0];
      const prereqUnit = prereq ? getUnit(prereq) : null;
      const reason = prereqUnit
        ? t('lesson.lockedPrereq', { unit: unitLabel(ctx, prereqUnit) })
        : t('lesson.lockedTitle');
      container.innerHTML = lockedPage(reason);
      attachCommon();
      return;
    }

    container.innerHTML = section ? sectionTemplate(state) : overviewTemplate(state);
    attachCommon();
    attachSectionActions(state);
    mountDemos(state);
  }

  function attachCommon() {
    container.querySelectorAll('[data-go]').forEach((node) => {
      node.addEventListener('click', () => router.go(node.dataset.go));
    });
    container.querySelectorAll('[data-term]').forEach((node) => {
      node.addEventListener('click', () => openTermModal(node.dataset.term));
    });
  }

  function attachSectionActions(state) {
    container.querySelectorAll('[data-next]').forEach((node) => {
      node.addEventListener('click', () => {
        const [unitIdValue, sectionIdValue, nextId] = node.dataset.next.split('|');
        const result = actions.markSectionRead(unitIdValue, sectionIdValue);
        if (result?.ok) router.go(`/academy/${unitIdValue}/${nextId}`);
      });
    });
    container.querySelectorAll('[data-finish]').forEach((node) => {
      node.addEventListener('click', () => {
        const [unitIdValue, sectionIdValue] = node.dataset.finish.split('|');
        const result = actions.markSectionRead(unitIdValue, sectionIdValue);
        if (result?.ok) router.go(`/academy/${unitIdValue}/practice`);
      });
    });
  }

  function mountDemos(state) {
    demoCleanups.forEach((cleanup) => cleanup());
    demoCleanups = [];
    if (!section) return;
    section.blocks.filter((block) => block.type === 'demo').forEach((block) => {
      const slot = container.querySelector(`[data-demo="${block.id}"]`);
      if (slot) {
        const cleanup = mountDemo(block.id, slot, ctx);
        if (cleanup) demoCleanups.push(cleanup);
      }
    });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
  }

  function destroy() {
    demoCleanups.forEach((cleanup) => cleanup());
    demoCleanups = [];
  }

  return { mount, render, destroy };
}
