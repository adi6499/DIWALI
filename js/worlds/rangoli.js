// World IV: the rangoli studio. Your design is laid onto the courtyard floor
// (live, a moment after each stroke) and can be downloaded as a PNG or used
// on a greeting card.
import { POWDERS } from '../rangoli/generator.js';
import { createStudio } from '../rangoli/studio.js';
import { setChecked, rovingGroup } from '../core/a11y.js';
import { canvasToBlob, downloadBlob } from '../core/ui.js';

export function createRangoliWorld(ctx) {
  const el = document.getElementById('world-rangoli');
  const canvas = document.getElementById('rangoli-canvas');
  const studioEl = document.getElementById('studio');
  const viewPanel = document.getElementById('courtyard-view');
  const swatches = document.getElementById('swatches');
  const toolGroup = document.getElementById('tool-group');
  const sizeRange = document.getElementById('size-range');
  let studio = null;
  let viewing = false;

  function init() {
    if (studio) return;
    const size = Math.min(window.innerWidth, window.innerHeight) < 500 || ctx.tier.name === 'low' ? 768 : 1024;
    studio = createStudio({
      canvas,
      cursorEl: document.getElementById('brush-cursor'),
      size,
      announce: ctx.announce,
      onChange: (ink) => {
        if (ctx.gl) ctx.palace.setRangoli(ink);
      },
    });
    studio.onSizeChange = (v) => { sizeRange.value = String(v); };

    POWDERS.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      b.tabIndex = i === 0 ? 0 : -1;
      b.setAttribute('aria-label', p.name);
      b.title = p.name;
      b.style.background = p.hex;
      b.dataset.index = String(i);
      swatches.append(b);
    });
    rovingGroup(swatches, '.swatch', (b) => {
      setChecked(swatches, '.swatch', b);
      studio.setColor(Number(b.dataset.index));
    });
    rovingGroup(toolGroup, '[data-tool]', (b) => {
      setChecked(toolGroup, '[data-tool]', b);
      studio.setTool(b.dataset.tool);
      ctx.announce(`${b.textContent} tool.`);
    });
    setChecked(toolGroup, '[data-tool]', toolGroup.querySelector('[aria-checked="true"]'));

    document.getElementById('sym-select').addEventListener('change', (e) => studio.setSymmetry(Number(e.target.value)));
    document.getElementById('mirror-toggle').addEventListener('change', (e) => studio.setMirror(e.target.checked));
    document.getElementById('floor-select').addEventListener('change', (e) => {
      studio.setFloor(e.target.value);
      canvas.style.background = e.target.value;
    });
    sizeRange.addEventListener('input', () => studio.setSize(Number(sizeRange.value)));
    document.getElementById('r-undo').addEventListener('click', () => { if (!studio.undo()) ctx.toast('Nothing to undo.'); });
    document.getElementById('r-redo').addEventListener('click', () => { if (!studio.redo()) ctx.toast('Nothing to redo.'); });
    document.getElementById('r-clear').addEventListener('click', () => studio.clear());
    document.getElementById('r-inspire').addEventListener('click', () => studio.inspire());
    document.getElementById('r-download').addEventListener('click', async () => {
      try {
        const blob = await canvasToBlob(studio.exportCanvas({ floor: true }));
        downloadBlob(blob, 'deepotsav-rangoli.png');
        ctx.toast('Rangoli saved as deepotsav-rangoli.png');
      } catch (err) {
        console.error(err);
        ctx.toast('Sorry, the image could not be saved.');
      }
    });
    document.getElementById('r-view').addEventListener('click', () => setViewing(true));
    document.getElementById('r-back').addEventListener('click', () => setViewing(false));

    // Continue a previous design, or start with a generated one
    studio.restore().then((restored) => {
      // Start with a generated design, unless the visitor has already begun drawing
      if (!restored && !studio.canUndo) studio.inspire();
      const floor = studio.state.floor;
      const sel = document.getElementById('floor-select');
      if ([...sel.options].some((o) => o.value === floor)) sel.value = floor;
      canvas.style.background = floor;
    });
  }

  function setViewing(on) {
    viewing = on;
    studioEl.hidden = on;
    viewPanel.hidden = !on;
    if (ctx.gl) {
      ctx.engine.maxFps = on ? 0 : 30;
      ctx.palace.rig.goTo(on ? ctx.palace.shots.rangoliView : ctx.palace.shots.rangoliTop, { duration: 2.4 });
      ctx.setShift(on ? 'panel' : 'none');
    }
    (on ? document.getElementById('r-back') : document.getElementById('r-view')).focus({ preventScroll: true });
    if (on && !ctx.gl) ctx.toast('The 3D courtyard is not available on this device, but your design is saved.');
  }

  return {
    id: 'rangoli',
    el,
    heading: document.getElementById('rangoli-title'),
    /** For greeting cards. */
    exportImage: () => (studio ? studio.exportCanvas({ floor: true, out: 720 }) : null),
    async enter() {
      await ctx.showScene('palace');
      ctx.ensureLit(true);
      init();
      setViewing(false);
      if (ctx.gl) {
        ctx.palace.setMood('none');
        ctx.palace.rig.goTo(ctx.palace.shots.rangoliTop, { duration: 2.6 });
        // The courtyard barely moves while you draw: render at 30 fps to save battery.
        ctx.engine.maxFps = 30;
      }
      ctx.setShift('none');
    },
    exit() {
      if (ctx.gl) ctx.engine.maxFps = 0;
      if (viewing) { studioEl.hidden = false; viewPanel.hidden = true; viewing = false; }
    },
  };
}
