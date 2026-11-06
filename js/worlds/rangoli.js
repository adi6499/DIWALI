// IV. Rangoli. The design on the courtyard floor is shown as you scroll past;
// "Draw your rangoli" opens the studio over the journey. Every stroke is laid
// onto the 3D floor a moment later; the design can be downloaded as a PNG.
import { POWDERS } from '../rangoli/generator.js';
import { createStudio } from '../rangoli/studio.js';
import { setChecked, rovingGroup } from '../core/a11y.js';
import { canvasToBlob, downloadBlob } from '../core/ui.js';
import { t, onLangChange } from '../i18n/index.js';

export function createRangoliWorld(ctx) {
  const el = document.getElementById('rangoli');
  const overlay = document.getElementById('studio-overlay');
  const canvas = document.getElementById('rangoli-canvas');
  const swatches = document.getElementById('swatches');
  const toolGroup = document.getElementById('tool-group');
  const sizeRange = document.getElementById('size-range');
  const openBtn = document.getElementById('open-studio');
  let studio = null;
  let restoring = null;

  function init() {
    if (studio) return restoring;
    const size = Math.min(window.innerWidth, window.innerHeight) < 500 || ctx.tier.name === 'low' ? 768 : 1024;
    studio = createStudio({
      canvas,
      cursorEl: document.getElementById('brush-cursor'),
      size,
      announce: ctx.announce,
      onChange: (ink) => { if (ctx.gl) ctx.palace.setRangoli(ink); },
    });
    studio.onSizeChange = (v) => { sizeRange.value = String(v); };

    POWDERS.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      b.tabIndex = i === 0 ? 0 : -1;
      b.dataset.color = p.id;
      b.style.background = p.hex;
      b.dataset.index = String(i);
      swatches.append(b);
    });
    const nameSwatches = () => {
      for (const b of swatches.children) {
        const name = t(`color.${b.dataset.color}`);
        b.setAttribute('aria-label', name);
        b.title = name;
      }
    };
    nameSwatches();
    onLangChange(nameSwatches);
    rovingGroup(swatches, '.swatch', (b) => {
      setChecked(swatches, '.swatch', b);
      studio.setColor(Number(b.dataset.index));
    });
    rovingGroup(toolGroup, '[data-tool]', (b) => {
      setChecked(toolGroup, '[data-tool]', b);
      studio.setTool(b.dataset.tool);
      ctx.announce(t('studio.toolSelected', { tool: b.textContent }));
    });
    setChecked(toolGroup, '[data-tool]', toolGroup.querySelector('[aria-checked="true"]'));

    document.getElementById('sym-select').addEventListener('change', (e) => studio.setSymmetry(Number(e.target.value)));
    document.getElementById('mirror-toggle').addEventListener('change', (e) => studio.setMirror(e.target.checked));
    document.getElementById('floor-select').addEventListener('change', (e) => {
      studio.setFloor(e.target.value);
      canvas.style.background = e.target.value;
    });
    sizeRange.addEventListener('input', () => studio.setSize(Number(sizeRange.value)));
    document.getElementById('r-undo').addEventListener('click', () => { if (!studio.undo()) ctx.toast(t('studio.nothingUndo')); });
    document.getElementById('r-redo').addEventListener('click', () => { if (!studio.redo()) ctx.toast(t('studio.nothingRedo')); });
    document.getElementById('r-clear').addEventListener('click', () => studio.clear());
    document.getElementById('r-inspire').addEventListener('click', () => studio.inspire());
    document.getElementById('r-download').addEventListener('click', async () => {
      try {
        const blob = await canvasToBlob(studio.exportCanvas({ floor: true }));
        downloadBlob(blob, 'deepotsav-rangoli.png');
        ctx.toast(t('studio.saved'));
      } catch (err) {
        console.error(err);
        ctx.toast(t('studio.saveFail'));
      }
    });
    document.getElementById('studio-close').addEventListener('click', close);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') trapFocus(e);
    });

    // Continue a previous design, or start with a generated one
    restoring = studio.restore().then((restored) => {
      if (!restored && !studio.canUndo) studio.inspire();
      const floor = studio.state.floor;
      const sel = document.getElementById('floor-select');
      if ([...sel.options].some((o) => o.value === floor)) sel.value = floor;
      canvas.style.background = floor;
    });
    return restoring;
  }

  function trapFocus(e) {
    const items = [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  async function open() {
    init();
    overlay.hidden = false;
    document.documentElement.classList.add('studio-open');
    if (ctx.gl) ctx.engine.maxFps = 30;
    document.getElementById('rangoli-title').focus({ preventScroll: true });
    studio.render();
    ctx.announce(t('studio.opened'));
  }

  function close() {
    overlay.hidden = true;
    document.documentElement.classList.remove('studio-open');
    if (ctx.gl) ctx.engine.maxFps = 0;
    openBtn.focus({ preventScroll: true });
    if (studio?.canUndo) ctx.explore?.mark('rangoli');
    ctx.announce(t('studio.closed'));
  }

  openBtn.addEventListener('click', open);

  return {
    id: 'rangoli',
    el,
    /** For greeting cards. */
    exportImage: () => (studio ? studio.exportCanvas({ floor: true, out: 720 }) : null),
    /** Load the saved design onto the floor without opening the studio. */
    preload: () => init(),
    enter() { init(); },
    exit() {},
  };
}
