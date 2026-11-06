// Accessibility helpers: live announcements, focus moves, motion preference.

const announcer = () => document.getElementById('announcer');
let clearTimer = 0;

export function announce(message) {
  const el = announcer();
  if (!el) return;
  el.textContent = '';
  // A frame later so screen readers notice the change even for repeated text.
  requestAnimationFrame(() => { el.textContent = message; });
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

export function focusHeading(el) {
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

const mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Resolve the effective setting: 'system' follows the OS. */
export function isReducedMotion(setting) {
  if (setting === 'reduced') return true;
  if (setting === 'full') return false;
  return !!(mql && mql.matches);
}

export function onSystemMotionChange(fn) {
  if (!mql) return;
  try { mql.addEventListener('change', fn); } catch { mql.addListener(fn); }
}

/** Roving-tabindex keyboard support for role=radiogroup / role=tablist. */
export function rovingGroup(container, selector, onSelect, { activateOnFocus = true } = {}) {
  const items = () => [...container.querySelectorAll(selector)];
  container.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next < 0) return;
    e.preventDefault();
    list[next].focus();
    if (activateOnFocus) onSelect(list[next]);
  });
  container.addEventListener('click', (e) => {
    const item = e.target.closest(selector);
    if (item && container.contains(item)) onSelect(item);
  });
}

/** Mark one radio-like button as checked within its group. */
export function setChecked(container, selector, target, attr = 'aria-checked') {
  for (const el of container.querySelectorAll(selector)) {
    const on = el === target;
    el.setAttribute(attr, on ? 'true' : 'false');
    el.tabIndex = on ? 0 : -1;
  }
}
