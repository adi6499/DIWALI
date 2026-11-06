// The explorer's journal: everything there is to find and do on the journey,
// kept on this device. A new discovery shows a short toast (with a dot on the
// journal button); the journal dialog lists what is found and what is left.
import { t, onLangChange } from '../i18n/index.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { STORAGE_KEYS } from '../config.js';
import { openDialog, closeDialog } from '../core/ui.js';

export const HIDDEN = ['owl', 'mouse', 'peacock', 'cow', 'conch'];
export const MILESTONES = ['flame', 'story', 'meanings', 'rangoli', 'fireworks', 'finale', 'wish', 'greeting', 'blessing', 'sound', 'language', 'lamps'];
export const FIREWORKS_GOAL = 10;

const fresh = () => ({ done: {}, found: {}, lit: [], fireworks: 0 });

export function createJournal(ctx, { lampsTotal = 0, hunt = false, onHint = null, onLightNext = null, onReset = null } = {}) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('journal-dialog');
  const dot = $('journal-dot');
  const huntList = $('hunt-list');
  const featList = $('feat-list');
  const saved = readJSON(STORAGE_KEYS.journal, null);
  let s = { ...fresh(), ...(saved || {}) };
  const hidden = hunt ? HIDDEN : [];
  const milestones = MILESTONES.filter((m) => m !== 'lamps' || lampsTotal > 0);
  const total = () => hidden.length + milestones.length;
  const count = () => hidden.filter((h) => s.found[h]).length + milestones.filter((m) => s.done[m]).length;
  const save = () => writeJSON(STORAGE_KEYS.journal, s);

  // Without the 3D courtyard there is nothing hidden and no diyas to light
  if (!hunt) {
    for (const el of dialog.querySelectorAll('[data-i18n="journal.hidden"], [data-i18n="journal.hiddenHelp"], [data-i18n="journal.lamps"]')) el.hidden = true;
    huntList.hidden = true;
    $('journal-lamps').hidden = true;
    $('lamps-meter').parentElement.hidden = true;
  }

  function tick(on) {
    const span = document.createElement('span');
    span.className = 'tick';
    span.setAttribute('aria-hidden', 'true');
    if (on) span.innerHTML = '<svg class="icon"><use href="#i-check"></use></svg>';
    else span.textContent = '?';
    return span;
  }

  function render() {
    $('journal-count').textContent = String(count());
    $('journal-total').textContent = String(total());
    $('journal-meter').style.transform = `scaleX(${count() / Math.max(1, total())})`;

    huntList.textContent = '';
    for (const id of hidden) {
      const found = !!s.found[id];
      const li = document.createElement('li');
      li.className = `hunt-item${found ? ' is-found' : ''}`;
      li.append(tick(found));
      const body = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = found ? t(`hunt.${id}.name`) : t('hunt.unknown');
      const riddle = document.createElement('p');
      riddle.className = 'fine';
      riddle.textContent = t(`hunt.${id}.riddle`);
      body.append(name, riddle);
      li.append(body);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small btn-ghost';
      btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-eye"></use></svg>';
      const label = document.createElement('span');
      label.textContent = found ? t('hunt.again') : t('hunt.hint');
      btn.append(label);
      btn.addEventListener('click', () => { closeDialog(dialog); onHint?.(id, found); });
      li.append(btn);
      huntList.append(li);
    }

    if (lampsTotal) {
      $('journal-lamps').textContent = s.lit.length
        ? t('journal.lampsCount', { n: s.lit.length, total: lampsTotal })
        : t('journal.lampsHelp');
      $('lamps-meter').style.transform = `scaleX(${s.lit.length / lampsTotal})`;
      let next = $('journal-light-next');
      if (!next) {
        next = document.createElement('button');
        next.type = 'button';
        next.id = 'journal-light-next';
        next.className = 'btn btn-small';
        next.addEventListener('click', () => onLightNext?.());
        $('lamps-meter').parentElement.after(next);
      }
      next.textContent = t('journal.lightNext');
      next.hidden = s.lit.length >= lampsTotal;
    }

    featList.textContent = '';
    for (const id of milestones) {
      const done = !!s.done[id];
      const li = document.createElement('li');
      li.className = `feat-item${done ? ' is-done' : ''}`;
      li.append(tick(done));
      const body = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = t(`ms.${id}`);
      body.append(name);
      if (!done) {
        const how = document.createElement('p');
        how.className = 'fine';
        how.textContent = id === 'fireworks' && s.fireworks
          ? `${t(`ms.${id}.how`)} (${Math.min(s.fireworks, FIREWORKS_GOAL)} / ${FIREWORKS_GOAL})`
          : t(`ms.${id}.how`);
        body.append(how);
      }
      li.append(body);
      featList.append(li);
    }
  }

  function celebrate(name) {
    dot.hidden = false;
    ctx.toast(t('journal.new', { name, n: count(), total: total() }), { action: { label: t('journal.open'), onClick: () => open() } });
    if (count() === total()) {
      setTimeout(() => ctx.toast(t('journal.complete'), { timeout: 9000 }), 2200);
      ctx.announce(t('journal.complete'));
    }
  }

  function mark(id) {
    if (s.done[id] || !milestones.includes(id)) return false;
    s.done[id] = Date.now();
    save();
    render();
    celebrate(t(`ms.${id}`));
    return true;
  }

  function found(id) {
    const first = !s.found[id];
    if (first) {
      s.found[id] = Date.now();
      save();
      render();
      dot.hidden = false;
      if (count() === total()) setTimeout(() => ctx.toast(t('journal.complete'), { timeout: 9000 }), 2600);
    }
    return { first, n: hidden.filter((h) => s.found[h]).length, total: hidden.length };
  }

  function bump(id) {
    if (id !== 'fireworks' || s.done.fireworks) return;
    s.fireworks += 1;
    save();
    if (s.fireworks >= FIREWORKS_GOAL) mark('fireworks');
  }

  function setLit(list) {
    s.lit = [...list];
    save();
    render();
    if (lampsTotal && s.lit.length >= lampsTotal) mark('lamps');
  }

  function open(opener) {
    dot.hidden = true;
    render();
    openDialog(dialog, opener || document.activeElement);
  }

  $('journal-reset').addEventListener('click', () => {
    if (!window.confirm(t('journal.resetConfirm'))) return;
    s = fresh();
    save();
    onReset?.();
    render();
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(dialog); });
  onLangChange(render);
  render();

  return {
    mark,
    found,
    bump,
    setLit,
    open,
    render,
    isFound: (id) => !!s.found[id],
    isDone: (id) => !!s.done[id],
    get lit() { return s.lit; },
  };
}
