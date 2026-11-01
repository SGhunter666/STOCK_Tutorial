/**
 * Shared UI surfaces: toasts, modal dialogs, glossary popovers and lock explanations.
 */
import { esc } from './dom.js';
import { icon } from './icons.js';
import { getGlossaryTerm, termKey } from '../education/glossary.js';
import { getUnit } from '../education/curriculum.js';
import { TOOL_DEFS, lockReason } from '../education/unlockManager.js';
import { recordGlossaryVisit } from '../education/practiceEngine.js';

let ctx = null;

export function initComponents(context) {
  ctx = context;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
}

function modalRoot() {
  return document.getElementById('modal-root');
}

export function toast(message, variant = 'info', duration = 3400) {
  const layer = document.getElementById('toast-layer');
  if (!layer) return;
  while (layer.children.length >= 3) layer.firstElementChild.remove();
  const node = document.createElement('div');
  node.className = `toast toast--${variant}`;
  node.innerHTML = `<span class="toast__dot"></span><span class="toast__text">${esc(message)}</span>`;
  layer.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 240);
  }, duration);
}

export function closeModal() {
  const root = modalRoot();
  if (root) {
    root.innerHTML = '';
    root.classList.remove('is-open');
  }
}

export function openModal({ title, subtitle = '', bodyHtml = '', footerHtml = '', size = 'md', onMount = null }) {
  const root = modalRoot();
  if (!root) return;
  const closeLabel = ctx ? ctx.i18n.t('common.close') : 'Close';
  root.classList.add('is-open');
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-close="true"></div>
    <div class="modal modal--${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal__head">
        <div>
          <h3 class="modal__title">${esc(title)}</h3>
          ${subtitle ? `<p class="modal__subtitle">${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" type="button" data-modal-close="true" aria-label="${esc(closeLabel)}">✕</button>
      </header>
      <div class="modal__body">${bodyHtml}</div>
      ${footerHtml ? `<footer class="modal__foot">${footerHtml}</footer>` : ''}
    </div>`;
  const backdrop = root.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', closeModal);
  root.querySelectorAll('[data-modal-close="true"]').forEach((node) => {
    if (node !== backdrop) node.addEventListener('click', closeModal);
  });
  if (onMount) onMount(root.querySelector('.modal'));
}

export function termOtherLocale(locale) {
  return locale === 'zh-CN' ? 'en' : 'zh-CN';
}

export function termName(termId, locale) {
  if (!ctx) return termId;
  return ctx.i18n.translate(locale, termKey(termId, 'name'));
}

export function openTermModal(termId, { locale } = {}) {
  if (!ctx) return;
  const term = getGlossaryTerm(termId);
  if (!term) return;
  const activeLocale = locale || ctx.i18n.locale;
  const other = termOtherLocale(activeLocale);
  const name = termName(termId, activeLocale);
  const otherName = termName(termId, other);
  const definition = ctx.i18n.translate(activeLocale, termKey(termId, 'def'));
  const example = ctx.i18n.translate(activeLocale, termKey(termId, 'example'));
  const otherDefinition = ctx.i18n.translate(other, termKey(termId, 'def'));
  const otherExample = ctx.i18n.translate(other, termKey(termId, 'example'));
  const unit = term.unitId ? getUnit(term.unitId) : null;
  const related = (term.related || []).map((id) => (
    `<button class="chip chip--ghost" type="button" data-term="${id}">${esc(termName(id, activeLocale))}</button>`
  )).join('');

  const body = `
    <div class="term-detail">
      <div class="term-detail__names">
        <span class="term-detail__primary">${esc(name)}</span>
        <span class="term-detail__secondary">${esc(otherName)}</span>
      </div>
      <p class="term-detail__def">${esc(definition)}</p>
      <div class="callout callout--example">
        <span class="callout__label">${ctx.i18n.t('glossary.example')}</span>
        <p>${esc(example)}</p>
      </div>
      <div class="term-detail__other">
        <span class="field-label">${esc(ctx.i18n.t(other === 'zh-CN' ? 'glossary.zhVersion' : 'glossary.enVersion'))}</span>
        <p>${esc(otherDefinition)}</p>
        <p class="muted">${esc(otherExample)}</p>
      </div>
      ${related ? `<div class="term-detail__related"><span class="field-label">${esc(ctx.i18n.t('glossary.related'))}</span><div class="chip-row">${related}</div></div>` : ''}
    </div>`;

  const footer = unit && unit.implemented
    ? `<button class="btn btn--ghost" type="button" data-go-lesson="${unit.id}">${esc(ctx.i18n.t('glossary.openLesson'))}</button>
       <button class="btn btn--primary" type="button" data-modal-close="true">${esc(ctx.i18n.t('common.close'))}</button>`
    : `<button class="btn btn--primary" type="button" data-modal-close="true">${esc(ctx.i18n.t('common.close'))}</button>`;

  openModal({ title: ctx.i18n.t('glossary.termTitle'), bodyHtml: body, footerHtml: footer, size: 'md' });

  const root = modalRoot();
  root.querySelectorAll('[data-term]').forEach((node) => {
    node.addEventListener('click', () => openTermModal(node.dataset.term));
  });
  const lessonButton = root.querySelector('[data-go-lesson]');
  if (lessonButton) {
    lessonButton.addEventListener('click', () => {
      closeModal();
      ctx.router.go(`/academy/${lessonButton.dataset.goLesson}`);
    });
  }
  recordGlossaryVisit(ctx.store, ctx.bus, termId);
}

export function openLockedToolModal(toolId) {
  if (!ctx) return;
  const def = TOOL_DEFS[toolId];
  if (!def) return;
  const reason = lockReason(ctx.store.get(), toolId);
  const t = ctx.i18n.t.bind(ctx.i18n);
  let requirement = t('unlock.unknown');
  const prereqTitles = [];
  if (reason?.type === 'phase') {
    requirement = t(reason.key, { phase: reason.phase });
  } else if (reason?.type === 'section') {
    const unit = getUnit(reason.unitId);
    const section = unit?.sections.find((s) => s.id === reason.sectionId);
    requirement = t('unlock.requiresSection', {
      unit: unit ? t(unit.titleKey) : reason.unitId,
      section: section ? t(section.titleKey) : reason.sectionId,
    });
    for (const prereqId of (unit?.prerequisites || [])) {
      const prereq = getUnit(prereqId);
      if (prereq) prereqTitles.push(t(prereq.titleKey));
    }
  } else if (reason?.type === 'unit') {
    const unit = getUnit(reason.unitId);
    requirement = t('unlock.requiresUnit', { unit: unit ? t(unit.titleKey) : reason.unitId });
    for (const prereqId of (unit?.prerequisites || [])) {
      const prereq = getUnit(prereqId);
      if (prereq) prereqTitles.push(t(prereq.titleKey));
    }
  }

  const body = `
    <div class="locked-detail">
      <div class="locked-detail__badge"><span class="lock-icon">${icon('lock', { size: 15 })}</span>${esc(t('common.locked'))}</div>
      <p class="locked-detail__desc">${esc(t(def.descKey))}</p>
      <div class="callout callout--tip">
        <span class="callout__label">${esc(t('unlock.howToUnlock'))}</span>
        <p>${esc(requirement)}</p>
      </div>
      ${prereqTitles.length ? `
      <div class="locked-detail__prereq">
        <span class="field-label">${esc(t('unlock.prereqTitle'))}</span>
        <p class="muted">${prereqTitles.map((title) => esc(title)).join(' · ')}</p>
      </div>` : ''}
      ${reason?.type === 'phase' ? `<p class="muted">${esc(t('unlock.phaseNote'))}</p>` : ''}
    </div>`;

  openModal({
    title: t(def.titleKey),
    subtitle: t(def.categoryKey),
    bodyHtml: body,
    footerHtml: `<button class="btn btn--primary" type="button" data-modal-close="true">${esc(t('common.gotIt'))}</button>`,
  });
}

export function confirmModal({ title, message, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    if (!ctx) {
      resolve(false);
      return;
    }
    const t = ctx.i18n.t.bind(ctx.i18n);
    let settled = false;
    openModal({
      title,
      bodyHtml: `<p class="confirm-text">${esc(message)}</p>`,
      footerHtml: `
        <button class="btn btn--ghost" type="button" data-confirm="false">${esc(cancelLabel || t('common.cancel'))}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm="true">${esc(confirmLabel || t('common.confirm'))}</button>`,
    });
    const root = modalRoot();
    root.querySelectorAll('[data-confirm]').forEach((node) => {
      node.addEventListener('click', () => {
        settled = true;
        resolve(node.dataset.confirm === 'true');
        closeModal();
      });
    });
    const backdrop = root.querySelector('.modal-backdrop');
    backdrop.addEventListener('click', () => {
      if (!settled) resolve(false);
    });
  });
}
