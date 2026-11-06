// Minimal observable state. One store holds app state; selected keys persist
// to localStorage so settings survive reloads.
import { readJSON, writeJSON } from './storage.js';

export function createStore(initial, { persistKey = null, persist = [] } = {}) {
  let state = { ...initial };
  if (persistKey) {
    const saved = readJSON(persistKey, {});
    for (const k of persist) if (saved && k in saved) state[k] = saved[k];
  }
  const subs = new Set();

  function save() {
    if (!persistKey) return;
    const out = {};
    for (const k of persist) out[k] = state[k];
    writeJSON(persistKey, out);
  }

  return {
    get: () => state,
    set(patch) {
      const prev = state;
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      if (persist.some((k) => prev[k] !== state[k])) save();
      for (const fn of subs) {
        try { fn(state, prev); } catch (err) { console.error('[store] subscriber failed', err); }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** Call fn(value, prev) whenever state[key] changes. */
    watch(key, fn) {
      return this.subscribe((s, p) => { if (s[key] !== p[key]) fn(s[key], p[key]); });
    },
  };
}
