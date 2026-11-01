/**
 * Small layout primitives shared across views to keep markup consistent.
 */
import { icon } from './icons.js';
import { progressBar } from './dom.js';

export function pageHead({ eyebrow = '', title, subtitle = '', actions = '' }) {
  return `
    <header class="page-head">
      <div class="page-head__text">
        ${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}
        <h1 class="page-title">${title}</h1>
        ${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ''}
      </div>
      ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
    </header>`;
}

export function card({ title = '', subtitle = '', body = '', actions = '', className = '', padded = true, id = '' }) {
  return `
    <section class="card ${className}" ${id ? `id="${id}"` : ''}>
      ${title || actions ? `
        <header class="card__head">
          <div>
            ${title ? `<h2 class="card__title">${title}</h2>` : ''}
            ${subtitle ? `<p class="card__subtitle">${subtitle}</p>` : ''}
          </div>
          ${actions ? `<div class="card__actions">${actions}</div>` : ''}
        </header>` : ''}
      <div class="card__body ${padded ? '' : 'card__body--flush'}">${body}</div>
    </section>`;
}

export function statCard({ label, value, sub = '', tone = '', iconName = '', id = '' }) {
  return `
    <div class="stat ${tone ? `stat--${tone}` : ''}">
      <div class="stat__head">
        <span class="stat__label">${label}</span>
        ${iconName ? `<span class="stat__icon">${icon(iconName, { size: 16 })}</span>` : ''}
      </div>
      <strong class="stat__value" ${id ? `id="${id}"` : ''}>${value}</strong>
      ${sub ? `<span class="stat__sub" ${id ? `id="${id}-sub"` : ''}>${sub}</span>` : ''}
    </div>`;
}

export function segmented({ options, active, attr, className = '' }) {
  return `
    <div class="segmented ${className}">
      ${options.map((option) => {
        const value = option.value ?? option;
        const label = option.label ?? option;
        const disabled = Boolean(option.disabled);
        return `<button class="segmented__item ${value === active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}"
          type="button" data-${attr}="${value}" ${disabled ? 'disabled' : ''} ${option.title ? `title="${option.title}"` : ''}>
          ${option.icon ? icon(option.icon, { size: 14 }) : ''}${label}
        </button>`;
      }).join('')}
    </div>`;
}

export function progressRow(label, pct, detail = '') {
  return `
    <div class="progress-row">
      <div class="progress-row__head"><span>${label}</span><span class="muted">${detail}</span></div>
      ${progressBar(pct)}
    </div>`;
}

export function chipRow(items) {
  return `<div class="chip-row">${items.join('')}</div>`;
}

export function table({ head, rows, className = '', empty = '' }) {
  if (!rows.length && empty) return empty;
  return `
    <div class="table-wrap ${className}">
      <table class="table">
        <thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

export function keyValueList(items) {
  return `<dl class="kv">${items.map(([key, value]) => `<div class="kv__row"><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
