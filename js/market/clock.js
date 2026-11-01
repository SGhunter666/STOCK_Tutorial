/**
 * Market clock: drives simulation ticks at the selected speed and exposes pause,
 * speed changes and "fast forward to next session".
 */
const SPEED_MS = { 1: 2000, 5: 800, 20: 250 };

export class MarketClock {
  constructor({ onTick, onFastForward }) {
    this.onTick = onTick;
    this.onFastForward = onFastForward;
    this.speed = 1;
    this.running = false;
    this.timer = null;
    this.suspended = false;
  }

  setSpeed(speed) {
    const next = Number(speed);
    if (![0, 1, 5, 20].includes(next)) return;
    this.speed = next;
    if (next === 0) {
      this.pause();
    } else {
      this.run();
    }
  }

  run() {
    if (this.running) this._restartTimer();
    this.running = true;
    this._restartTimer();
  }

  pause() {
    this.running = false;
    this._clearTimer();
  }

  toggle() {
    if (this.running) this.pause();
    else this.run();
  }

  _restartTimer() {
    this._clearTimer();
    if (!this.running || this.suspended) return;
    const ms = SPEED_MS[this.speed] || SPEED_MS[1];
    this.timer = setInterval(() => {
      if (!this.running || this.suspended) return;
      try {
        this.onTick();
      } catch (err) {
        console.error('[clock] tick failed', err);
      }
    }, ms);
  }

  _clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Pause scheduling while the tab is hidden (keeps simulation state frozen). */
  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    this._clearTimer();
  }

  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.running) this._restartTimer();
  }

  nextDay() {
    this.onFastForward();
  }

  destroy() {
    this.pause();
  }
}
