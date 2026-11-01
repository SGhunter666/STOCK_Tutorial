/**
 * Sandbox mode: an independent paper-trading book with configurable capital,
 * market seed and commission. It never writes to the career save.
 */
import { money } from '../../core/format.js';
import { pageHead, card, keyValueList } from '../kit.js';
import { icon } from '../icons.js';
import { equity } from '../../trading/account.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function createSandboxView(ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;

  const isSandbox = () => actions.getAppMode() === 'sandbox';

  function setupCard(state) {
    const config = actions.getSandboxConfig();
    return card({
      className: 'settings-wide',
      title: t('sandbox.setupTitle'),
      subtitle: t('sandbox.setupSubtitle'),
      body: `
        <div class="sandbox-form">
          <label class="demo-field">
            <span class="field-label">${t('sandbox.cashLabel')}</span>
            <input class="input" type="number" id="sandbox-cash" min="1000" max="10000000" step="1000" value="${config.cash}">
            <span class="muted">${t('sandbox.cashHint')}</span>
          </label>
          <label class="demo-field">
            <span class="field-label">${t('sandbox.seedLabel')}</span>
            <input class="input" type="text" id="sandbox-seed" maxlength="48" value="${String(config.seed).replace(/"/g, '&quot;')}">
            <span class="muted">${t('sandbox.seedHint')}</span>
          </label>
          <label class="demo-field">
            <span class="field-label">${t('sandbox.difficultyLabel')}</span>
            <select class="input input--select" id="sandbox-difficulty">
              ${DIFFICULTIES.map((id) => `<option value="${id}" ${config.difficulty === id ? 'selected' : ''}>${t(`sandbox.difficulty.${id}`)}</option>`).join('')}
            </select>
            <span class="muted">${t('sandbox.difficultyHint')}</span>
          </label>
        </div>
        <div class="button-row">
          <button class="btn btn--primary" type="button" data-sandbox-start>${icon('sparkle', { size: 15 })} ${t('sandbox.start')}</button>
        </div>
        <p class="muted">${t('sandbox.note')}</p>`,
    });
  }

  function currentCard(state) {
    const config = actions.getSandboxConfig();
    return card({
      title: t('sandbox.currentTitle'),
      subtitle: t('sandbox.currentSubtitle'),
      body: `
        ${keyValueList([
          [t('sandbox.cashLabel'), money(state.account.initialCash, i18n.locale)],
          [t('sandbox.seedLabel'), `<span class="mono">${config.seed}</span>`],
          [t('sandbox.difficultyLabel'), t(`sandbox.difficulty.${config.difficulty}`)],
          [t('sandbox.commission'), money(state.settings.commission, i18n.locale)],
          [t('sandbox.equityLabel'), money(equity(state.account, state.market.quotes), i18n.locale)],
        ])}
        <div class="button-row">
          <button class="btn btn--primary btn--sm" type="button" data-sandbox-restart>${icon('next', { size: 14 })} ${t('sandbox.restart')}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-sandbox-exit>${icon('arrowRight', { size: 14 })} ${t('sandbox.exit')}</button>
        </div>
        <p class="muted">${t('sandbox.activeNote')}</p>`,
    });
  }

  function template(state) {
    return `
      <div class="sandbox-page">
        ${pageHead({
          eyebrow: t('sandbox.eyebrow'),
          title: t('sandbox.title'),
          subtitle: t('sandbox.subtitle'),
          actions: `<span class="pill">${isSandbox() ? t('sandbox.activePill') : t('sandbox.careerPill')}</span>`,
        })}
        <div class="settings-grid">
          ${isSandbox() ? currentCard(state) : setupCard(state)}
          ${card({
            title: t('sandbox.rulesTitle'),
            subtitle: t('sandbox.rulesSubtitle'),
            body: `<ul class="aside-list">
              <li>${t('sandbox.ruleIndependent')}</li>
              <li>${t('sandbox.ruleCourse')}</li>
              <li>${t('sandbox.ruleReset')}</li>
              <li>${t('sandbox.ruleDifficulty')}</li>
            </ul>`,
          })}
        </div>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-sandbox-start]')) {
        const cash = Number(container.querySelector('#sandbox-cash')?.value);
        const seed = container.querySelector('#sandbox-seed')?.value;
        const difficulty = container.querySelector('#sandbox-difficulty')?.value;
        actions.startSandbox({ cash, seed, difficulty });
        return;
      }
      if (event.target.closest('[data-sandbox-restart]')) {
        actions.restartSandbox();
        return;
      }
      if (event.target.closest('[data-sandbox-exit]')) {
        actions.exitSandbox();
      }
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
