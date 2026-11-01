/**
 * Challenge mode: goal-based trading runs with explicit deadlines and risk rules.
 */
import { money, num, pct } from '../../core/format.js';
import { pageHead, card } from '../kit.js';
import { progressBar } from '../dom.js';
import { icon } from '../icons.js';
import {
  CHALLENGES, challengeProgress, challengeSummary, ensureChallenges, isChallengeUnlocked,
} from '../../education/challenges.js';
import { getUnit } from '../../education/curriculum.js';
import { unitLabel } from '../labels.js';

export function createChallengesView(ctx) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;

  function formatValue(kind, value) {
    if (kind === 'return' || kind === 'drawdownMax') return pct(value, i18n.locale, 1, false);
    if (kind === 'trades' || kind === 'optionTrades' || kind === 'futuresTrades') return num(value, i18n.locale, 0);
    return value ? t('challenges.yes') : t('challenges.no');
  }

  function checkLine(check, progress) {
    const label = t(`challenges.metric.${check.kind}`);
    const requirement = check.target
      ? (check.kind === 'drawdownMax' ? t('challenges.maxRequirement', { value: formatValue(check.kind, check.target) }) : t('challenges.minRequirement', { value: formatValue(check.kind, check.target) }))
      : t('challenges.booleanRequirement');
    if (!progress) {
      return `<li class="challenge-check">${icon('check', { size: 12 })}<span>${label} · ${requirement}</span></li>`;
    }
    return `<li class="challenge-check ${check.done ? 'is-done' : ''}">
      ${icon('check', { size: 12 })}
      <span>${label} · ${t('challenges.progressValue', { current: formatValue(check.kind, check.current), target: check.target ? formatValue(check.kind, check.target) : t('challenges.booleanTarget') })}</span>
    </li>`;
  }

  function activeCard(state) {
    const summary = challengeSummary(state);
    if (!summary) {
      return card({
        title: t('challenges.noActiveTitle'),
        subtitle: t('challenges.noActiveSubtitle'),
        body: `<p class="muted">${t('challenges.noActiveText')}</p>`,
      });
    }
    const { challenge, checks, remaining, values } = summary;
    return card({
      className: 'challenge-active',
      title: t('challenges.activeTitle'),
      subtitle: t(challenge.titleKey),
      actions: `<span class="pill">${t('challenges.daysLeft', { days: remaining })}</span>`,
      body: `
        <div class="challenge-active__stats">
          <div><span class="muted">${t('challenges.metric.return')}</span><strong class="${values.return >= 0 ? 'up' : 'down'}">${pct(values.return, i18n.locale, 1)}</strong></div>
          <div><span class="muted">${t('challenges.metric.drawdownMax')}</span><strong>${pct(values.drawdownMax, i18n.locale, 1, false)}</strong></div>
          <div><span class="muted">${t('challenges.metric.trades')}</span><strong>${num(values.trades, i18n.locale, 0)}</strong></div>
          <div><span class="muted">${t('challenges.equityLabel')}</span><strong>${money(values.currentEquity, i18n.locale)}</strong></div>
        </div>
        <ul class="challenge-checks">${checks.map((check) => checkLine(check, summary)).join('')}</ul>
        ${progressBar(checks.filter((check) => check.done).length / checks.length * 100, 'accent')}
        <div class="button-row">
          <button class="btn btn--danger btn--sm" type="button" data-challenge-abandon>${t('challenges.abandon')}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-go="/portfolio">${t('challenges.openPortfolio')}</button>
        </div>
        <p class="muted">${t('challenges.activeNote')}</p>`,
    });
  }

  function challengeCard(challenge, state) {
    ensureChallenges(state);
    const unlocked = isChallengeUnlocked(state, challenge);
    const completed = state.challenges.completed.includes(challenge.id);
    const active = state.challenges.active && state.challenges.active.id === challenge.id;
    const progress = active ? challengeProgress(state, challenge) : null;
    const unit = getUnit(challenge.unlockUnit);
    const checks = progress
      ? progress.checks.map((check) => checkLine(check, progress))
      : challenge.checks.map((check) => checkLine(check, null));
    return `
      <article class="challenge-card ${completed ? 'is-complete' : active ? 'is-active' : ''} ${unlocked ? '' : 'is-locked'}">
        <header class="challenge-card__head">
          <span class="challenge-card__xp">+${challenge.xp} XP</span>
          <div class="challenge-card__titles">
            <h2>${t(challenge.titleKey)}</h2>
            <p class="muted">${t(challenge.descKey)}</p>
          </div>
          ${completed
            ? `<span class="unit-card__done">${icon('check', { size: 14 })} ${t('challenges.completed')}</span>`
            : active
              ? `<span class="pill">${t('challenges.inProgress')}</span>`
              : `<span class="unit-card__meta">${t('challenges.days', { days: challenge.days })}</span>`}
        </header>
        <ul class="challenge-checks">${checks.join('')}</ul>
        <footer class="challenge-card__actions">
          ${unlocked
            ? (active
              ? `<span class="locked-note">${t('challenges.alreadyActive')}</span>`
              : `<button class="btn btn--primary btn--sm" type="button" data-challenge-start="${challenge.id}">${completed ? t('challenges.retry') : t('challenges.start')}</button>`)
            : `<span class="locked-note">${icon('lock', { size: 13 })} ${t('challenges.lockedByUnit', { unit: unit ? unitLabel(ctx, unit) : challenge.unlockUnit })}</span>
               <button class="btn btn--ghost btn--sm" type="button" data-go="/academy/${challenge.unlockUnit}">${t('challenges.goUnlock')}</button>`}
        </footer>
      </article>`;
  }

  function template(state) {
    ensureChallenges(state);
    return `
      <div class="challenges-page">
        ${pageHead({
          eyebrow: t('challenges.eyebrow'),
          title: t('challenges.title'),
          subtitle: t('challenges.subtitle'),
          actions: `<span class="pill">${t('challenges.badge', { done: state.challenges.completed.length, total: CHALLENGES.length })}</span>`,
        })}
        ${activeCard(state)}
        <div class="challenge-grid">
          ${CHALLENGES.map((challenge) => challengeCard(challenge, state)).join('')}
        </div>
        <p class="chart-note muted">${t('challenges.note')}</p>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const start = event.target.closest('[data-challenge-start]');
      if (start) {
        const result = actions.startChallenge(start.dataset.challengeStart);
        if (result && !result.ok) ctx.toast(i18n.t(result.error), 'warning');
        return;
      }
      if (event.target.closest('[data-challenge-abandon]')) {
        actions.abandonChallenge();
        return;
      }
      const go = event.target.closest('[data-go]');
      if (go) router.go(go.dataset.go);
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
