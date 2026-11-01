/**
 * Tiny synchronous event bus used to keep simulation, education and UI layers decoupled.
 * Nothing in this module touches the DOM.
 */
export function createBus() {
  const listeners = new Map();
  const history = [];
  const HISTORY_LIMIT = 400;

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => off(event, handler);
  }

  function once(event, handler) {
    const wrapped = (payload) => {
      off(event, wrapped);
      handler(payload);
    };
    return on(event, wrapped);
  }

  function off(event, handler) {
    const set = listeners.get(event);
    if (set) set.delete(handler);
  }

  function emit(event, payload = {}) {
    history.push({ event, payload });
    if (history.length > HISTORY_LIMIT) history.shift();
    const set = listeners.get(event);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(payload);
        } catch (err) {
          // A broken listener must never stop the simulation loop.
          console.error(`[bus] listener for "${event}" failed`, err);
        }
      }
    }
  }

  /** Recent events, used by the practice engine to verify real player actions. */
  function recent(event, limit = HISTORY_LIMIT) {
    return history.filter((entry) => entry.event === event).slice(-limit);
  }

  return { on, once, off, emit, recent };
}
