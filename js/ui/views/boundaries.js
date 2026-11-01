/**
 * Explicit simulation boundaries: cash-settled futures, approximated early
 * assignment and survivorship-biased historical samples.
 */
import { pageHead, card } from '../kit.js';
import { icon } from '../icons.js';

const BOUNDARIES = [
  { id: 'futures', iconName: 'challenges' },
  { id: 'options', iconName: 'options' },
  { id: 'history', iconName: 'roadmap' },
];

export function createBoundariesView(ctx) {
  const { i18n, router } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;

  function template() {
    return `
      <div class="boundaries-page">
        ${pageHead({
          eyebrow: t('boundaries.eyebrow'),
          title: t('boundaries.title'),
          subtitle: t('boundaries.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/settings">${icon('settings', { size: 15 })} ${t('boundaries.back')}</button>`,
        })}
        <p class="boundary-intro muted">${t('boundaries.intro')}</p>
        <div class="boundary-grid">
          ${BOUNDARIES.map((boundary) => card({
            className: 'boundary-card',
            title: t(`boundaries.${boundary.id}.title`),
            subtitle: t('boundaries.eyebrow'),
            actions: `<span class="boundary-card__icon">${icon(boundary.iconName, { size: 18 })}</span>`,
            body: `<p>${t(`boundaries.${boundary.id}.body`)}</p>
              <p class="muted">${t(`boundaries.${boundary.id}.detail`)}</p>`,
          })).join('')}
        </div>
        <p class="chart-note muted">${t('boundaries.note')}</p>
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
    container.innerHTML = template();
  }

  function render() {
    if (container) container.innerHTML = template();
  }

  function destroy() {
    // no dynamic resources
  }

  return { mount, render, destroy };
}
