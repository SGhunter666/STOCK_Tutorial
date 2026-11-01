/**
 * Career mode: rank ladder, promotion requirements and salary status.
 */
import { money, num } from '../../core/format.js';
import { pageHead, card, statCard } from '../kit.js';
import { icon } from '../icons.js';
import {
  CAREER_RANKS, CAREER_SALARY_INTERVAL, careerProgress,
  careerRequirementUnit, careerRequirementChallenge, careerRequirementBranch,
} from '../../education/career.js';
import { unitLabel } from '../labels.js';

export function createCareerView(ctx) {
  const { i18n, store, actions } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;

  function requirementLabel(requirement) {
    switch (requirement.kind) {
      case 'unit': {
        const unit = careerRequirementUnit(requirement);
        return t('career.req.unit', { unit: unit ? unitLabel(ctx, unit) : requirement.unitId });
      }
      case 'units':
        return t('career.req.units', { target: requirement.target });
      case 'trades':
        return t('career.req.trades', { target: requirement.target });
      case 'inspected':
        return t('career.req.inspected', { target: requirement.target });
      case 'demo':
        return t('career.req.demo', { demo: t(`demo.${requirement.demoId}.title`) });
      case 'equity':
        return t('career.req.equity', { value: money(requirement.target, i18n.locale) });
      case 'options':
        return t('career.req.options', { target: requirement.target });
      case 'futures':
        return t('career.req.futures', { target: requirement.target });
      case 'challenge': {
        const challenge = careerRequirementChallenge(requirement);
        return t('career.req.challenge', {
          challenge: challenge ? t(challenge.titleKey) : requirement.challengeId,
        });
      }
      case 'challenges':
        return t('career.req.challenges', { target: requirement.target });
      case 'branch': {
        const branch = careerRequirementBranch(requirement);
        return t('career.req.branch', {
          branch: branch ? t(branch.nameKey) : requirement.branchId,
        });
      }
      case 'branches':
        return t('career.req.branches', { target: requirement.target });
      case 'xp':
        return t('career.req.xp', { target: requirement.target });
      default:
        return requirement.kind;
    }
  }

  function requirementValue(requirement) {
    const current = requirement.rawCurrent ?? requirement.current;
    if (requirement.kind === 'equity') {
      return t('career.progressMoney', {
        current: money(current, i18n.locale),
        target: money(requirement.target, i18n.locale),
      });
    }
    if (requirement.kind === 'xp') {
      return t('career.progressValue', {
        current: num(current, i18n.locale, 0),
        target: num(requirement.target, i18n.locale, 0),
      });
    }
    return t('career.progressValue', {
      current: num(current, i18n.locale, 0),
      target: num(requirement.target, i18n.locale, 0),
    });
  }

  function requirementsBody(progress) {
    if (!progress.requirements.length) {
      return `<p class="muted">${t('career.maxRankText')}</p>`;
    }
    return `
      <div class="career-requirements">
        ${progress.requirements.map((requirement) => `
          <div class="career-req ${requirement.done ? 'is-done' : ''}">
            <div class="career-req__head">
              <span>${requirement.done ? icon('check', { size: 13 }) : icon('sparkle', { size: 13 })} ${requirementLabel(requirement)}</span>
              <span class="muted">${requirementValue(requirement)}</span>
            </div>
            <div class="progress">
              <div class="progress__track"><div class="progress__fill progress__fill--accent" style="width:${requirement.pct}%"></div></div>
            </div>
          </div>`).join('')}
      </div>
      <p class="muted career-hint">${t('career.promoteHint')}</p>`;
  }

  function currentCard(progress) {
    const { rank, next, requirements, ready } = progress;
    return card({
      className: 'career-current',
      title: t('career.currentTitle'),
      subtitle: t(rank.titleKey),
      actions: `<span class="pill">${t('career.rankLabel', { number: rank.number })}</span>`,
      body: `
        <p class="career-rank__desc">${t(rank.descKey)}</p>
        <div class="career-meta">
          <span>${t('career.salaryLabel')}</span>
          <strong>${rank.salary > 0 ? t('career.salaryValue', { amount: money(rank.salary, i18n.locale), days: CAREER_SALARY_INTERVAL }) : t('career.noSalary')}</strong>
          <span>${t('career.nextRankLabel')}</span>
          <strong>${next ? t(next.titleKey) : t('career.maxRank')}</strong>
        </div>
        ${requirementsBody(progress)}
        <div class="button-row">
          ${next
            ? `<button class="btn btn--primary" type="button" data-career-promote ${ready ? '' : 'disabled'}>${icon('sparkle', { size: 15 })} ${t('career.promote', { rank: t(next.titleKey) })}</button>`
            : `<span class="locked-note">${icon('check', { size: 14 })} ${t('career.maxRankReached')}</span>`}
        </div>
        <p class="chart-note muted">${t('career.currentNote')}</p>`,
    });
  }

  function rankCard(rank, progress) {
    const current = rank.number === progress.rank.number;
    const achieved = rank.number < progress.rank.number;
    return `
      <article class="career-rank ${achieved ? 'is-complete' : current ? 'is-active' : 'is-locked'}">
        <header class="career-rank__head">
          <span class="career-rank__number">${rank.number}</span>
          <div class="career-rank__titles">
            <h3>${t(rank.titleKey)}</h3>
            <p class="muted">${t(rank.descKey)}</p>
          </div>
          ${achieved
            ? `<span class="unit-card__done">${icon('check', { size: 13 })} ${t('career.achieved')}</span>`
            : current
              ? `<span class="pill">${t('career.current')}</span>`
              : `<span class="unit-card__meta">${t('career.locked')}</span>`}
        </header>
        <div class="career-rank__foot">
          <span class="muted">${t('career.salaryLabel')}</span>
          <strong>${rank.salary > 0 ? money(rank.salary, i18n.locale) : t('career.noSalary')}</strong>
        </div>
      </article>`;
  }

  function template(state) {
    const progress = careerProgress(state);
    const careerIncome = state.account.careerIncome || 0;
    return `
      <div class="career-page">
        ${pageHead({
          eyebrow: t('career.eyebrow'),
          title: t('career.title'),
          subtitle: t('career.subtitle'),
          actions: `<span class="pill">${t(progress.rank.titleKey)}</span>`,
        })}
        ${ctx.appMode === 'sandbox' ? `<p class="chart-note muted">${t('career.sandboxNote')}</p>` : ''}
        <div class="stat-grid">
          ${statCard({
            label: t('career.currentRank'),
            value: t(progress.rank.titleKey),
            sub: t('career.rankLabel', { number: progress.rank.number }),
            iconName: 'portfolio',
          })}
          ${statCard({
            label: t('career.salaryLabel'),
            value: progress.rank.salary > 0 ? money(progress.rank.salary, i18n.locale) : t('career.noSalary'),
            sub: progress.nextSalaryDay != null
              ? t('career.salaryIn', { days: progress.daysToSalary })
              : t('career.noSalarySub'),
            iconName: 'sparkle',
          })}
          ${statCard({
            label: t('career.careerIncome'),
            value: money(careerIncome, i18n.locale),
            sub: t('career.careerIncomeSub'),
            iconName: 'portfolio',
          })}
          ${statCard({
            label: t('career.xpLabel'),
            value: num(state.education.xp || 0, i18n.locale, 0),
            sub: t('career.xpSub'),
            iconName: 'sparkle',
          })}
        </div>
        ${currentCard(progress)}
        <section class="career-ladder">
          <header class="career-ladder__head">
            <h2>${t('career.ladderTitle')}</h2>
            <p class="muted">${t('career.ladderSubtitle')}</p>
          </header>
          <div class="career-grid">
            ${CAREER_RANKS.map((rank) => rankCard(rank, progress)).join('')}
          </div>
        </section>
        <p class="chart-note muted">${t('career.note')}</p>
      </div>`;
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-career-promote]')) {
        actions.promoteCareer();
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
