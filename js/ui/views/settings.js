/**
 * Settings: language, simulation speed, layout, accessibility, save data and scope.
 */
import { pageHead, card, segmented } from '../kit.js';
import { icon } from '../icons.js';
import { confirmModal } from '../components.js';
import { esc } from '../dom.js';
import { PHASE_SCOPE } from './roadmap.js';

export function createSettingsView(ctx) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;
  let saveInfo = { lastSavedAt: null, storage: 'indexeddb' };

  function refreshSaveInfo() {
    saveInfo = actions.getSaveInfo() || saveInfo;
  }

  function template(state) {
    const speed = store.get().settings.speed;
    const layoutValue = state.settings.layout;
    return `
      <div class="settings-page">
        ${pageHead({
          eyebrow: t('settings.eyebrow'),
          title: t('settings.title'),
          subtitle: t('settings.subtitle'),
        })}
        <div class="settings-grid">
          ${card({
            title: t('settings.languageTitle'),
            subtitle: t('settings.languageSubtitle'),
            body: `
              <div class="language-cards">
                <button class="language-card ${i18n.locale === 'zh-CN' ? 'is-active' : ''}" type="button" data-lang="zh-CN">
                  <span class="language-card__code">zh-CN</span>
                  <strong>简体中文</strong>
                  <span class="muted">${t('settings.languageZhNote')}</span>
                </button>
                <button class="language-card ${i18n.locale === 'en' ? 'is-active' : ''}" type="button" data-lang="en">
                  <span class="language-card__code">en</span>
                  <strong>English</strong>
                  <span class="muted">${t('settings.languageEnNote')}</span>
                </button>
              </div>
              <p class="muted">${t('settings.languageHint')}</p>`,
          })}
          ${card({
            title: t('settings.simulationTitle'),
            subtitle: t('settings.simulationSubtitle'),
            body: `
              <div class="setting-row">
                <span class="field-label">${t('settings.speed')}</span>
                ${segmented({
                  options: [
                    { value: 0, label: t('clock.speedPaused') },
                    { value: 1, label: '1×' },
                    { value: 5, label: '5×' },
                    { value: 20, label: '20×' },
                  ],
                  active: speed,
                  attr: 'speed-setting',
                })}
              </div>
              <div class="setting-row">
                <span class="field-label">${t('settings.layoutTitle')}</span>
                ${segmented({
                  options: [{ value: 'beginner', label: t('settings.beginner') }, { value: 'advanced', label: t('settings.advanced') }],
                  active: layoutValue,
                  attr: 'layout-setting',
                })}
              </div>
              <p class="muted">${t('settings.layoutHint')}</p>
              <div class="setting-row">
                <span class="field-label">${t('settings.themeTitle')}</span>
                ${segmented({
                  options: [{ value: 'dark', label: t('settings.themeDark') }, { value: 'light', label: t('settings.themeLight') }],
                  active: state.settings.theme,
                  attr: 'theme-setting',
                })}
              </div>
              <p class="muted">${t('settings.themeHint')}</p>
              <div class="setting-row">
                <label class="switch-row">
                  <input type="checkbox" id="reduced-motion" ${state.settings.reducedMotion ? 'checked' : ''}>
                  <span>
                    <strong>${t('settings.reducedMotion')}</strong>
                    <span class="muted">${t('settings.reducedMotionHint')}</span>
                  </span>
                </label>
              </div>`,
          })}
          ${card({
            title: t('settings.liveTitle'),
            subtitle: t('settings.liveSubtitle'),
            body: `
              <div class="fund-form">
                <label class="field">
                  <span class="field-label">${t('settings.liveUrlLabel')}</span>
                  <input class="input" id="live-feed-url" type="url" maxlength="300"
                    value="${esc(state.settings.liveFeedUrl || '')}"
                    placeholder="${t('settings.liveUrlPlaceholder')}">
                </label>
                <label class="field">
                  <span class="field-label">${t('settings.liveIntervalLabel')}</span>
                  <select class="input input--select" id="live-feed-interval">
                    ${[15, 30, 60].map((value) => `<option value="${value}" ${value === state.settings.liveFeedInterval ? 'selected' : ''}>${t('settings.liveIntervalOption', { seconds: value })}</option>`).join('')}
                  </select>
                </label>
              </div>
              <div class="button-row">
                <button class="btn btn--primary btn--sm" type="button" data-live-feed-save>${icon('check', { size: 14 })} ${t('settings.liveSave')}</button>
              </div>
              <p class="muted">${t('settings.liveHint')}</p>
              <p class="chart-note muted">${t('settings.liveSchema')}</p>`,
          })}
          ${card({
            className: 'settings-wide',
            title: t('settings.dataTitle'),
            subtitle: t('settings.dataSubtitle'),
            body: `
              <div class="save-status">
                <span class="save-status__dot"></span>
                <div>
                  <strong>${t('settings.saveStatus')}</strong>
                  <span class="muted">${saveInfo.lastSavedAt
                    ? t('settings.lastSaved', { time: new Intl.DateTimeFormat(i18n.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(saveInfo.lastSavedAt)) })
                    : t('settings.notSavedYet')}</span>
                </div>
                <span class="pill">${saveInfo.storage === 'localstorage' ? 'localStorage' : 'IndexedDB'}</span>
              </div>
              <div class="button-row">
                <button class="btn btn--primary btn--sm" type="button" data-action="save">${icon('download', { size: 14 })} ${t('settings.saveNow')}</button>
                <button class="btn btn--ghost btn--sm" type="button" data-action="export">${icon('download', { size: 14 })} ${t('settings.exportSave')}</button>
                <label class="btn btn--ghost btn--sm file-btn">
                  ${icon('upload', { size: 14 })} ${t('settings.importSave')}
                  <input type="file" accept="application/json" id="import-file" hidden>
                </label>
                <button class="btn btn--danger btn--sm" type="button" data-action="reset">${icon('trash', { size: 14 })} ${t('settings.resetProgress')}</button>
              </div>
              <p class="muted">${t('settings.dataHint')}</p>`,
          })}
          ${card({
            title: t('settings.scopeTitle'),
            subtitle: t('settings.scopeSubtitle'),
            body: `
              <p class="muted">${t('settings.scopeText')}</p>
              <div class="scope-columns">
                <div>
                  <span class="field-label">${t('settings.scopeIncluded')}</span>
                  <ul class="aside-list">${PHASE_SCOPE.phase1.map((key) => `<li>${t(key)}</li>`).join('')}</ul>
                </div>
                <div>
                  <span class="field-label">${t('settings.scopePlanned')}</span>
                  <ul class="aside-list">${PHASE_SCOPE.planned.map((key) => `<li>${t(key)}</li>`).join('')}</ul>
                </div>
              </div>
              <p class="page-footnote">${t('settings.disclaimer')}</p>`,
          })}
          ${card({
            title: t('boundaries.title'),
            subtitle: t('boundaries.subtitle'),
            body: `<p class="muted">${t('boundaries.intro')}</p>
              <a class="btn btn--ghost btn--sm" href="#/boundaries">${t('boundaries.settingsLink')}</a>`,
          })}
        </div>
      </div>`;
  }

  function handleReset() {
    confirmModal({
      title: t('settings.resetTitle'),
      message: t('settings.resetMessage'),
      confirmLabel: t('settings.resetConfirm'),
      danger: true,
    }).then((confirmed) => {
      if (confirmed) actions.resetGame();
    });
  }

  function bind(state) {
    container.querySelectorAll('[data-lang]').forEach((button) => {
      button.addEventListener('click', () => actions.setLocale(button.dataset.lang));
    });
    container.querySelectorAll('[data-speed-setting]').forEach((button) => {
      button.addEventListener('click', () => {
        actions.setSpeed(Number(button.dataset.speedSetting));
        container.querySelectorAll('[data-speed-setting]').forEach((node) => {
          node.classList.toggle('is-active', Number(node.dataset.speedSetting) === Number(button.dataset.speedSetting));
        });
      });
    });
    container.querySelectorAll('[data-layout-setting]').forEach((button) => {
      button.addEventListener('click', () => actions.setLayout(button.dataset.layoutSetting));
    });
    container.querySelectorAll('[data-theme-setting]').forEach((button) => {
      button.addEventListener('click', () => actions.setTheme(button.dataset.themeSetting));
    });
    container.querySelector('#reduced-motion')?.addEventListener('change', (event) => {
      actions.setReducedMotion(event.target.checked);
    });
    container.querySelector('[data-live-feed-save]')?.addEventListener('click', () => {
      actions.setLiveFeedConfig({
        url: container.querySelector('#live-feed-url')?.value || '',
        interval: Number(container.querySelector('#live-feed-interval')?.value || 60),
      });
    });
    container.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
      await actions.saveNow();
      refreshSaveInfo();
      render(store.get());
    });
    container.querySelector('[data-action="export"]')?.addEventListener('click', () => actions.exportSave());
    container.querySelector('[data-action="reset"]')?.addEventListener('click', handleReset);
    container.querySelector('#import-file')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) actions.importSave(file);
    });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    refreshSaveInfo();
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    bind(state);
  }

  function destroy() {}

  return { mount, render, destroy };
}
