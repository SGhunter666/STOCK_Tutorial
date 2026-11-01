/**
 * Central state container. The UI never mutates state directly: mutators receive
 * a draft object and emit a named event so views can update precisely.
 */
export function createStore({ bus, initialState }) {
  let state = initialState;
  const subscribers = new Set();

  function get() {
    return state;
  }

  function subscribe(handler) {
    subscribers.add(handler);
    return () => subscribers.delete(handler);
  }

  function notify(meta = {}) {
    for (const handler of [...subscribers]) {
      try {
        handler(state, meta);
      } catch (err) {
        console.error('[store] subscriber failed', err);
      }
    }
    if (bus) bus.emit('state:changed', meta);
  }

  function update(mutator, meta = {}) {
    mutator(state);
    notify(meta);
    return state;
  }

  function replace(nextState, meta = {}) {
    state = nextState;
    notify(meta);
    return state;
  }

  return { get, update, replace, subscribe, notify };
}

export function clone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(value));
}
