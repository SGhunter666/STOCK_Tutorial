/**
 * Bilingual glossary: search across both languages, definitions in both languages.
 */
import { pageHead } from '../kit.js';
import { icon } from '../icons.js';
import { esc } from '../dom.js';
import { openTermModal } from '../components.js';
import { GLOSSARY_TERMS, termKey } from '../../education/glossary.js';
import { getUnit } from '../../education/curriculum.js';
import { unitLabel } from '../labels.js';

export function createGlossaryView(ctx) {
  const { i18n, store, router } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;
  let query = '';

  function termText(term) {
    const locale = i18n.locale;
    const other = i18n.otherLocale();
    return {
      name: i18n.translate(locale, termKey(term.id, 'name')),
      alt: i18n.translate(other, termKey(term.id, 'name')),
      def: i18n.translate(locale, termKey(term.id, 'def')),
      example: i18n.translate(locale, termKey(term.id, 'example')),
      search: [
        i18n.translate(locale, termKey(term.id, 'name')),
        i18n.translate(other, termKey(term.id, 'name')),
        i18n.translate(locale, termKey(term.id, 'def')),
        i18n.translate(other, termKey(term.id, 'def')),
      ].join(' ').toLowerCase(),
    };
  }

  function cardHtml(term) {
    const text = termText(term);
    const unit = getUnit(term.unitId);
    return `
      <article class="glossary-card" data-term="${term.id}" data-search="${esc(text.search)}">
        <header class="glossary-card__head">
          <div>
            <h3 class="glossary-card__name">${text.name}</h3>
            <span class="glossary-card__alt">${text.alt}</span>
          </div>
          <button class="icon-btn icon-btn--ghost" type="button" data-term="${term.id}" title="${t('glossary.open')}">${icon('arrowRight', { size: 16 })}</button>
        </header>
        <p class="glossary-card__def">${text.def}</p>
        <div class="callout callout--example glossary-card__example">
          <span class="callout__label">${t('glossary.example')}</span>
          <p>${text.example}</p>
        </div>
        <footer class="glossary-card__foot">
          <div class="chip-row">
            ${(term.related || []).map((id) => `<button class="chip chip--ghost" type="button" data-term="${id}">${i18n.translate(i18n.locale, termKey(id, 'name'))}</button>`).join('')}
          </div>
          ${unit && unit.implemented
            ? `<a class="link-btn" href="#/academy/${unit.id}">${icon('academy', { size: 13 })} ${t('glossary.lesson', { unit: unitLabel(ctx, unit) })}</a>`
            : ''}
        </footer>
      </article>`;
  }

  function template(state) {
    return `
      <div class="glossary-page">
        ${pageHead({
          eyebrow: t('glossary.eyebrow'),
          title: t('glossary.title'),
          subtitle: t('glossary.subtitle', { count: GLOSSARY_TERMS.length }),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy">${icon('academy', { size: 15 })} ${t('nav.academy')}</button>`,
        })}
        <div class="glossary-toolbar">
          <label class="search-field">
            ${icon('search', { size: 16 })}
            <input class="input input--search" id="glossary-search" type="search" placeholder="${t('glossary.searchPlaceholder')}" value="${query}">
          </label>
          <span class="muted">${t('glossary.twoLanguages')}</span>
        </div>
        <div class="glossary-grid">
          ${GLOSSARY_TERMS.map((term) => cardHtml(term)).join('')}
        </div>
        <p class="market-empty muted" id="glossary-empty" hidden>${t('glossary.noResults')}</p>
        <p class="page-footnote">${t('glossary.disclaimer')}</p>
      </div>`;
  }

  function applyFilter() {
    const needle = query.trim().toLowerCase();
    let visible = 0;
    container.querySelectorAll('.glossary-card').forEach((card) => {
      const show = !needle || card.dataset.search.includes(needle);
      card.hidden = !show;
      if (show) visible += 1;
    });
    const empty = container.querySelector('#glossary-empty');
    if (empty) empty.hidden = visible > 0;
  }

  function bind() {
    container.querySelector('#glossary-search')?.addEventListener('input', (event) => {
      query = event.target.value;
      applyFilter();
    });
    container.querySelectorAll('[data-term]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        const termId = node.dataset.term;
        openTermModal(termId);
      });
    });
    container.querySelectorAll('[data-go]').forEach((node) => {
      node.addEventListener('click', () => router.go(node.dataset.go));
    });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    bind();
    applyFilter();
  }

  function destroy() {}

  return { mount, render, destroy };
}
