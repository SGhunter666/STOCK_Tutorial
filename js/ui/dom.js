/**
 * Small DOM helpers shared by views. Views build HTML strings and use delegated
 * listeners so re-rendering cannot leak handlers.
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export function qs(selector, root = document) {
  return root ? root.querySelector(selector) : null;
}

export function qsa(selector, root = document) {
  return root ? [...root.querySelectorAll(selector)] : [];
}

export function on(root, event, selector, handler) {
  if (!root) return () => {};
  const listener = (evt) => {
    const target = evt.target.closest(selector);
    if (target && root.contains(target)) handler(evt, target);
  };
  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

export function cssVar(name, fallback = '') {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Ensures every view reacts to state updates consistently and ignores silent ones. */
export function viewSubscription(store, view) {
  return store.subscribe((state, meta = {}) => {
    if (meta.silentView) return;
    if (meta.type === 'market:tick' && !meta.fills && !meta.dayClosed) {
      if (view.onTick) view.onTick(state);
      return;
    }
    view.render(state);
  });
}

export function formatRows(rows, cellFn) {
  return rows.map(cellFn).join('');
}

export function emptyState(icon, title, text, actionHtml = '') {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">${icon}</div>
      <p class="empty-state__title">${title}</p>
      <p class="empty-state__text">${text}</p>
      ${actionHtml}
    </div>`;
}

export function badge(text, variant = 'neutral') {
  return `<span class="badge badge--${variant}">${text}</span>`;
}

export function progressBar(pct, variant = 'accent', showLabel = false) {
  const value = Math.max(0, Math.min(100, pct));
  return `
    <div class="progress ${showLabel ? 'progress--labelled' : ''}">
      <div class="progress__track"><div class="progress__fill progress__fill--${variant}" style="width:${value}%"></div></div>
      ${showLabel ? `<span class="progress__label">${Math.round(value)}%</span>` : ''}
    </div>`;
}

export function moneyClass(value) {
  if (!Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}
