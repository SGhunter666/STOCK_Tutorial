/**
 * Hash router with per-route scroll restoration so a language switch can rebuild
 * the current view without losing the player's place.
 */
export class Router {
  constructor({ onRoute }) {
    this.onRoute = onRoute;
    this.current = '/dashboard';
    this.scrollPositions = new Map();
    this._handler = () => this.handle();
  }

  start() {
    window.addEventListener('hashchange', this._handler);
    this.handle();
  }

  parsePath() {
    const raw = window.location.hash.replace(/^#/, '');
    const path = raw || '/dashboard';
    const segments = path.split('/').filter(Boolean);
    return { path, segments };
  }

  handle() {
    const previous = this.current;
    const { path, segments } = this.parsePath();
    if (previous && previous !== path) {
      this.scrollPositions.set(previous, window.scrollY || 0);
    }
    this.current = path;
    this.onRoute({ path, segments });
    const saved = this.scrollPositions.get(path) || 0;
    requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'auto' }));
  }

  go(path, { replace = false } = {}) {
    const hash = `#${path.startsWith('/') ? path : `/${path}`}`;
    if (replace) {
      window.history.replaceState(null, '', hash);
      this.handle();
      return;
    }
    if (window.location.hash === hash) {
      this.onRoute(this.parsePath());
      return;
    }
    window.location.hash = hash;
  }

  rerender() {
    const { path, segments } = this.parsePath();
    this.current = path;
    this.onRoute({ path, segments, rerender: true });
  }

  destroy() {
    window.removeEventListener('hashchange', this._handler);
  }
}
