/**
 * Independent simulation clock for the fictional exchange.
 * One real second advances one simulated second at 1x. Every speed runs the
 * same per-second callback; faster modes only shorten the wall-clock interval.
 */

export const SIM_SPEEDS = Object.freeze({ 1: 1000, 5: 200, 10: 100, 30: 33, 60: 16 });
export const SIM_SESSION_SECONDS = 23_400; // 09:30:00 .. 16:00:00

export class SimulationClock {
  constructor({ onSecond, onMinute, speed = 1 } = {}) {
    this.onSecond = onSecond || (() => {});
    this.onMinute = onMinute || (() => {});
    this.speed = SIM_SPEEDS[speed] ? speed : 1;
    this.running = false;
    this.timer = null;
    this.secondCounter = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._schedule();
  }

  pause() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  setSpeed(speed) {
    if (!SIM_SPEEDS[speed]) return;
    this.speed = speed;
    if (this.running) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this._schedule();
    }
  }

  /** Runs one simulated second. Safe to call while paused (manual stepping). */
  step() {
    this.secondCounter += 1;
    this.onSecond();
    if (this.secondCounter % 60 === 0) this.onMinute();
    return this.secondCounter;
  }

  stepSeconds(count = 1) {
    const n = Math.max(1, Math.floor(count));
    for (let index = 0; index < n; index += 1) this.step();
  }

  stepMinute() {
    this.stepSeconds(60);
  }

  _schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.step();
      this._schedule();
    }, SIM_SPEEDS[this.speed]);
  }

  destroy() {
    this.pause();
    this.onSecond = () => {};
    this.onMinute = () => {};
  }
}
