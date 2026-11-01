/**
 * Inline stroke icons. Kept local so the game has zero network dependencies.
 */
const PATHS = {
  dashboard: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
  academy: '<path d="M4 6a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v14H6a2 2 0 0 1-2-2z"/><path d="M7 4v14"/><path d="M10 8h6"/>',
  market: '<path d="M5 21V11"/><rect x="3.4" y="8" width="3.2" height="6" rx="1"/><path d="M12 21V6"/><rect x="10.4" y="4" width="3.2" height="9" rx="1"/><path d="M19 21V13"/><rect x="17.4" y="10" width="3.2" height="5" rx="1"/>',
  trading: '<path d="M4 8h13"/><path d="M14 5l3 3-3 3"/><path d="M20 16H7"/><path d="M10 19l-3-3 3-3"/>',
  portfolio: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6V12l5.6 4.4"/>',
  news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 16.5h5"/>',
  options: '<path d="M3.5 18l6-6 4 4 7-8"/><path d="M16.5 8H20v3.5"/>',
  challenges: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 4 2.2 4H6"/>',
  glossary: '<path d="M4 19l5.2-14L14.4 19"/><path d="M6.4 14h5.8"/><path d="M16.5 19V9h2.2a1.8 1.8 0 0 1 0 3.6h-2.2"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 3v2.6"/><path d="M12 18.4V21"/><path d="M3 12h2.6"/><path d="M18.4 12H21"/><path d="M5.4 5.4l1.8 1.8"/><path d="M16.8 16.8l1.8 1.8"/><path d="M18.6 5.4l-1.8 1.8"/><path d="M7.2 16.8l-1.8 1.8"/>',
  roadmap: '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6H16a2 2 0 0 1 2 2v7.6"/><path d="M6 8.4V13"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><path d="M12 3.4a14 14 0 0 1 0 17.2a14 14 0 0 1 0-17.2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  arrowRight: '<path d="M4.5 12h14"/><path d="M13 6.5l5.5 5.5-5.5 5.5"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  play: '<path d="M8.5 5.5l10 6.5-10 6.5z"/>',
  pause: '<path d="M9.5 5.5v13"/><path d="M14.5 5.5v13"/>',
  next: '<path d="M6 5.5l8.5 6.5L6 18.5z"/><path d="M18.5 5.5v13"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.5"/><path d="M12 7.6v.5"/>',
  warning: '<path d="M12 4l8.5 15.5H3.5z"/><path d="M12 9.5v4.2"/><path d="M12 16.8v.4"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15 15l4.5 4.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>',
  download: '<path d="M12 4v11"/><path d="M7.5 11.5L12 16l4.5-4.5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9"/><path d="M7.5 12.5L12 8l4.5 4.5"/><path d="M5 4h14"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V4.5h6V7"/><path d="M7 7l1 13h8l1-13"/>',
};

export function icon(name, { size = 20, className = '' } = {}) {
  const path = PATHS[name];
  if (!path) return '';
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function filledIcon(name, { size = 20, className = '' } = {}) {
  const path = PATHS[name];
  if (!path) return '';
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">${path}</svg>`;
}
