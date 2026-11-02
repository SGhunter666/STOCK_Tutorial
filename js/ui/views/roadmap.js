/**
 * Roadmap: honest phase-by-phase status of the project.
 */
import { pageHead } from '../kit.js';
import { icon } from '../icons.js';

export const PHASE_SCOPE = {
  phase1: [
    'settings.scope.p1a',
    'settings.scope.p1b',
    'settings.scope.p1c',
    'settings.scope.p1d',
    'settings.scope.p1e',
    'settings.scope.p1f',
    'settings.scope.p1g',
    'settings.scope.p1h',
    'settings.scope.p1i',
    'settings.scope.p1j',
  ],
  planned: [
    'settings.scope.future.a',
    'settings.scope.future.b',
    'settings.scope.future.c',
    'settings.scope.future.d',
    'settings.scope.future.e',
  ],
};

const PHASES = [
  {
    id: 1,
    status: 'shipped',
    titleKey: 'roadmap.p1.title',
    textKey: 'roadmap.p1.text',
    items: ['roadmap.p1.i1', 'roadmap.p1.i2', 'roadmap.p1.i3', 'roadmap.p1.i4', 'roadmap.p1.i5'],
  },
  {
    id: 2,
    status: 'shipped',
    titleKey: 'roadmap.p2.title',
    textKey: 'roadmap.p2.text',
    items: ['roadmap.p2.i1', 'roadmap.p2.i2', 'roadmap.p2.i3', 'roadmap.p2.i4'],
  },
  {
    id: 3,
    status: 'shipped',
    titleKey: 'roadmap.p3.title',
    textKey: 'roadmap.p3.text',
    items: ['roadmap.p3.i1', 'roadmap.p3.i2', 'roadmap.p3.i3'],
  },
  {
    id: 4,
    status: 'shipped',
    titleKey: 'roadmap.p4.title',
    textKey: 'roadmap.p4.text',
    items: ['roadmap.p4.i1', 'roadmap.p4.i2', 'roadmap.p4.i3', 'roadmap.p4.i4'],
  },
  {
    id: 5,
    status: 'shipped',
    titleKey: 'roadmap.p5.title',
    textKey: 'roadmap.p5.text',
    items: ['roadmap.p5.i1', 'roadmap.p5.i2', 'roadmap.p5.i3'],
  },
  {
    id: 6,
    status: 'shipped',
    titleKey: 'roadmap.p6.title',
    textKey: 'roadmap.p6.text',
    items: ['roadmap.p6.i1', 'roadmap.p6.i2', 'roadmap.p6.i3', 'roadmap.p6.i4'],
  },
  {
    id: 7,
    status: 'shipped',
    titleKey: 'roadmap.p7.title',
    textKey: 'roadmap.p7.text',
    items: ['roadmap.p7.i1', 'roadmap.p7.i2', 'roadmap.p7.i3', 'roadmap.p7.i4'],
  },
  {
    id: 8,
    status: 'shipped',
    titleKey: 'roadmap.p8.title',
    textKey: 'roadmap.p8.text',
    items: ['roadmap.p8.i1', 'roadmap.p8.i2', 'roadmap.p8.i3', 'roadmap.p8.i4'],
  },
];

export function createRoadmapView(ctx) {
  const { i18n, router } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;

  function template() {
    return `
      <div class="roadmap-page">
        ${pageHead({
          eyebrow: t('roadmap.eyebrow'),
          title: t('roadmap.title'),
          subtitle: t('roadmap.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/academy">${icon('academy', { size: 15 })} ${t('nav.academy')}</button>`,
        })}
        <div class="roadmap-list">
          ${PHASES.map((phase) => `
            <article class="phase-card ${phase.status === 'shipped' ? 'is-shipped' : 'is-planned'}">
              <header class="phase-card__head">
                <span class="phase-card__number">${phase.id}</span>
                <div>
                  <h2 class="phase-card__title">${t(phase.titleKey)}</h2>
                  <span class="pill ${phase.status === 'shipped' ? 'pill--ok' : 'pill--planned'}">
                    ${phase.status === 'shipped' ? icon('check', { size: 12 }) : icon('lock', { size: 12 })}
                    ${t(phase.status === 'shipped' ? 'roadmap.statusShipped' : 'roadmap.statusPlanned')}
                  </span>
                </div>
              </header>
              <p class="phase-card__text">${t(phase.textKey)}</p>
              <ul class="phase-card__items">${phase.items.map((key) => `<li>${icon('check', { size: 12 })} ${t(key)}</li>`).join('')}</ul>
            </article>`).join('')}
        </div>
        <p class="page-footnote">${t('roadmap.note')}</p>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    container.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) router.go(go.dataset.go);
    });
    container.innerHTML = template();
  }

  function render() {}

  function destroy() {}

  return { mount, render, destroy };
}

export function createLockedFeatureView(ctx, kind) {
  const { i18n, router } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;
  const phase = kind === 'options' ? 4 : 3;
  const titleKey = kind === 'options' ? 'locked.options.title' : 'locked.challenges.title';
  const textKey = kind === 'options' ? 'locked.options.text' : 'locked.challenges.text';
  const items = kind === 'options'
    ? ['locked.options.i1', 'locked.options.i2', 'locked.options.i3', 'locked.options.i4']
    : ['locked.challenges.i1', 'locked.challenges.i2', 'locked.challenges.i3'];

  function template() {
    return `
      <div class="locked-page">
        ${pageHead({
          eyebrow: t('locked.eyebrow'),
          title: t(titleKey),
          subtitle: t('locked.subtitle', { phase }),
        })}
        <div class="card locked-feature">
          <div class="locked-feature__icon">${icon('lock', { size: 30 })}</div>
          <div class="locked-feature__body">
            <p>${t(textKey)}</p>
            <ul class="aside-list">${items.map((key) => `<li>${icon('check', { size: 12 })} ${t(key)}</li>`).join('')}</ul>
            <div class="callout callout--warning">
              <span class="callout__label">${t('locked.notAvailable')}</span>
              <p>${t('locked.notAvailableText', { phase })}</p>
            </div>
            <div class="button-row">
              <button class="btn btn--primary btn--sm" type="button" data-go="/academy">${t('locked.backToAcademy')}</button>
              <button class="btn btn--ghost btn--sm" type="button" data-go="/roadmap">${t('roadmap.title')}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    container.addEventListener('click', (event) => {
      const go = event.target.closest('[data-go]');
      if (go) router.go(go.dataset.go);
    });
    container.innerHTML = template();
  }

  return { mount, render() {}, destroy() {} };
}
