/**
 * Career mode: rank ladder, research tasks, investment reports, performance
 * reviews, certifications, promotion requirements and salary status.
 */
import { money, num, pct } from '../../core/format.js';
import { pageHead, card, statCard } from '../kit.js';
import { icon } from '../icons.js';
import { esc } from '../dom.js';
import { formatMarketDate } from '../../market/calendar.js';
import {
  CAREER_RANKS, CAREER_SALARY_INTERVAL, CAREER_EVAL_INTERVAL, REPORT_MIN_SCORE,
  careerProgress, careerRequirementUnit, careerRequirementChallenge, careerRequirementBranch,
} from '../../education/career.js';
import { unitLabel } from '../labels.js';

const drafts = new Map();

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
      case 'reports':
        return t('career.req.reports', { target: requirement.target });
      case 'reportScore':
        return t('career.req.reportScore', { target: requirement.target });
      case 'evaluations':
        return t('career.req.evaluations', { target: requirement.target });
      case 'certificates':
        return t('career.req.certificates', { target: requirement.target });
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

  function draftFor(task, state) {
    if (!drafts.has(task.id)) {
      const quote = state.market.quotes[task.ticker];
      const last = quote ? quote.last : 50;
      drafts.set(task.id, {
        thesis: 'bull',
        conviction: '3',
        targetPrice: (Math.round(last * 1.05 * 100) / 100).toFixed(2),
        summary: '',
      });
    }
    return drafts.get(task.id);
  }

  function taskReportForm(task, state) {
    const draft = draftFor(task, state);
    return `
      <form class="career-form" data-report-form data-task-id="${task.id}">
        <label class="field">
          <span class="field-label">${t('career.report.thesis')}</span>
          <select class="input input--select" name="thesis">
            ${['bull', 'bear', 'neutral'].map((thesis) => `<option value="${thesis}" ${draft.thesis === thesis ? 'selected' : ''}>${t(`career.report.${thesis}`)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">${t('career.report.conviction')}</span>
          <select class="input input--select" name="conviction">
            ${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${draft.conviction === String(value) ? 'selected' : ''}>${t('career.report.convictionValue', { value })}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">${t('career.report.target')}</span>
          <input class="input" type="number" min="0.01" step="0.01" name="targetPrice" value="${draft.targetPrice}" inputmode="decimal">
        </label>
        <label class="field field--wide">
          <span class="field-label">${t('career.report.summary')}</span>
          <textarea class="input" name="summary" rows="4" maxlength="2000" placeholder="${t('career.report.summaryHint')}">${esc(draft.summary)}</textarea>
          <span class="field-hint">${t('career.report.summaryNote', { min: 40 })}</span>
        </label>
        <div class="field field--wide">
          <button class="btn btn--primary" type="submit">${icon('check', { size: 14 })} ${t('career.report.submit')}</button>
        </div>
      </form>`;
  }

  function taskEntry(task, progress, state) {
    const report = task.reportId ? progress.reports.find((entry) => entry.id === task.reportId) : null;
    const statusKey = `career.task.status.${task.status}`;
    const active = task.status === 'active';
    return `
      <article class="career-task ${active ? 'is-active' : ''}">
        <header class="career-task__head">
          <div>
            <strong>${t(task.titleKey)}</strong>
            <p class="muted">${t(task.descKey, { ticker: task.ticker })}</p>
          </div>
          <span class="pill">${t(statusKey)}</span>
        </header>
        <div class="career-task__meta">
          <span>${t('career.task.ticker', { ticker: task.ticker })}</span>
          <span>${t('career.task.deadline', { day: formatMarketDate(task.deadlineDay, i18n.locale) })}</span>
          <span>${t('career.task.rewardXp', { xp: task.rewardXp })}</span>
          <span>${t('career.task.rewardCash', { cash: money(task.rewardCash, i18n.locale) })}</span>
        </div>
        ${task.status === 'available' ? `
          <div class="button-row">
            <button class="btn btn--primary btn--sm" type="button" data-task-accept="${task.id}">${t('career.task.accept')}</button>
          </div>` : ''}
        ${active ? taskReportForm(task, state) : ''}
        ${report ? `<p class="career-task__result">${t('career.task.completedScore', {
    grade: report.grade, score: report.score,
  })}</p>` : ''}
      </article>`;
  }

  function tasksCard(progress, state) {
    const tasks = [...progress.tasks].reverse().slice(0, 6);
    return card({
      title: t('career.tasksTitle'),
      subtitle: t('career.tasksSubtitle', {
        active: progress.activeTasks.length, available: progress.availableTasks.length,
      }),
      body: tasks.length
        ? `<div class="career-task-list">${tasks.map((task) => taskEntry(task, progress, state)).join('')}</div>`
        : `<p class="muted">${t('career.tasksEmpty')}</p>`,
    });
  }

  function reportsCard(progress) {
    const rows = progress.reports.slice(0, 8);
    return card({
      title: t('career.reportsTitle'),
      subtitle: t('career.reportsSubtitle', {
        passed: progress.passedReports, total: progress.reports.length,
      }),
      body: rows.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr>
              <th>${t('career.report.day')}</th><th>${t('career.report.ticker')}</th>
              <th>${t('career.report.thesis')}</th><th>${t('career.report.target')}</th>
              <th>${t('career.report.grade')}</th><th>${t('career.report.score')}</th>
            </tr></thead>
            <tbody>${rows.map((report) => `
              <tr>
                <td>${formatMarketDate(report.day, i18n.locale)}</td>
                <td class="mono">${report.ticker}</td>
                <td>${t(`career.report.${report.thesis}`)}</td>
                <td class="num">${money(report.targetPrice, i18n.locale)}</td>
                <td><span class="pill">${report.grade}</span></td>
                <td class="num">${report.score}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          <p class="chart-note muted">${t('career.reportsNote', { min: REPORT_MIN_SCORE })}</p>`
        : `<p class="muted">${t('career.reportsEmpty')}</p>`,
    });
  }

  function evaluationsCard(progress, state) {
    const evaluations = progress.evaluations.slice(0, 6);
    const days = Math.max(0, progress.career.lastEvalDay + CAREER_EVAL_INTERVAL - state.market.day);
    return card({
      title: t('career.evalsTitle'),
      subtitle: t('career.evalsSubtitle', { days }),
      actions: `<span class="pill">${t('career.evalsInterval', { days: CAREER_EVAL_INTERVAL })}</span>`,
      body: evaluations.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr>
              <th>${t('career.eval.day')}</th><th>${t('career.eval.return')}</th>
              <th>${t('career.eval.drawdown')}</th><th>${t('career.eval.reports')}</th>
              <th>${t('career.report.grade')}</th><th>${t('career.report.score')}</th>
            </tr></thead>
            <tbody>${evaluations.map((evaluation) => `
              <tr>
                <td>${formatMarketDate(evaluation.day, i18n.locale)}</td>
                <td class="num ${evaluation.returnPct >= 0 ? 'up' : 'down'}">${pct(evaluation.returnPct, i18n.locale, 2, false)}</td>
                <td class="num down">${pct(evaluation.drawdownPct, i18n.locale, 2, false)}</td>
                <td class="num">${evaluation.reports}</td>
                <td><span class="pill">${evaluation.grade}</span></td>
                <td class="num">${evaluation.score}</td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : `<p class="muted">${t('career.evalsEmpty')}</p>`,
    });
  }

  function certificatesCard(progress) {
    return card({
      title: t('career.certsTitle'),
      subtitle: t('career.certsSubtitle'),
      body: `
        <div class="career-requirements">
          ${progress.certificates.map((certificate) => `
            <div class="career-req ${certificate.earned ? 'is-done' : ''}">
              <div class="career-req__head">
                <span>${certificate.earned ? icon('check', { size: 13 }) : icon('lock', { size: 13 })} ${t(certificate.titleKey)}</span>
                <span class="muted">${certificate.earned ? t('career.cert.earned') : t('career.progressValue', { current: certificate.current, target: certificate.target })}</span>
              </div>
              <p class="chart-note muted">${t(certificate.descKey)}</p>
              <div class="progress">
                <div class="progress__track"><div class="progress__fill progress__fill--accent" style="width:${certificate.pct}%"></div></div>
              </div>
            </div>`).join('')}
        </div>
        <p class="chart-note muted">${t('career.cert.note')}</p>`,
    });
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
        <div class="career-panels">
          ${tasksCard(progress, state)}
          ${certificatesCard(progress)}
        </div>
        <div class="career-panels">
          ${reportsCard(progress)}
          ${evaluationsCard(progress, state)}
        </div>
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

  function captureDraft(form) {
    const taskId = form.dataset.taskId;
    const draft = drafts.get(taskId) || {};
    draft.thesis = form.querySelector('[name="thesis"]')?.value || 'bull';
    draft.conviction = form.querySelector('[name="conviction"]')?.value || '3';
    draft.targetPrice = form.querySelector('[name="targetPrice"]')?.value || '';
    draft.summary = form.querySelector('[name="summary"]')?.value || '';
    drafts.set(taskId, draft);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const promote = event.target.closest('[data-career-promote]');
      if (promote) actions.promoteCareer();
      const accept = event.target.closest('[data-task-accept]');
      if (accept) actions.acceptResearchTask(accept.dataset.taskAccept);
    });
    container.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-report-form]');
      if (!form) return;
      event.preventDefault();
      captureDraft(form);
      const draft = drafts.get(form.dataset.taskId);
      const result = actions.submitInvestmentReport({
        taskId: form.dataset.taskId,
        thesis: draft.thesis,
        conviction: Number(draft.conviction),
        targetPrice: Number(draft.targetPrice),
        summary: draft.summary,
      });
      if (result?.ok) drafts.delete(form.dataset.taskId);
    });
    container.addEventListener('input', (event) => {
      const form = event.target.closest('[data-report-form]');
      if (form) captureDraft(form);
    });
    container.addEventListener('change', (event) => {
      const form = event.target.closest('[data-report-form]');
      if (form) captureDraft(form);
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
