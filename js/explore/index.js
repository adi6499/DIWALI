// Things to discover along the journey: diyas to light, five hidden things,
// a blessing for today, and the journal that keeps track of it all. Taps on
// the 3D stage come here first; anything that isn't a lamp or a hidden thing
// goes on to the part of the journey on screen.
import { createJournal } from './journal.js';
import { createBlessing } from './blessing.js';

export async function createExplore(ctx) {
  let lamps = null;
  let hunt = null;
  if (ctx.gl) {
    const [{ createPlayerLamps }, { createHunt }] = await Promise.all([import('./lamps.js'), import('./hunt.js')]);
    const journalRef = { current: null };
    lamps = createPlayerLamps(ctx, {
      onChange: (list) => journalRef.current?.setLit(list),
    });
    const journal = createJournal(ctx, {
      lampsTotal: lamps.total,
      hunt: true,
      onHint: (id) => hunt?.hint(id),
      onLightNext: () => lamps.lightNext(),
      onReset: () => { lamps.reset(); hunt?.reset(); },
    });
    journalRef.current = journal;
    // lamps lit on an earlier visit stay lit
    for (const i of journal.lit) lamps.restore(i);
    hunt = createHunt(ctx, journal);
    ctx.onFrame((dt, time) => {
      lamps.update(dt);
      hunt.update(dt, time);
    });
    return api(ctx, journal, lamps, hunt);
  }
  return api(ctx, createJournal(ctx, { lampsTotal: 0, hunt: false }), null, null);
}

function api(ctx, journal, lamps, hunt) {
  createBlessing(ctx);
  for (const b of document.querySelectorAll('[data-open-journal]')) b.addEventListener('click', (e) => journal.open(e.currentTarget));
  return {
    mark: journal.mark,
    bump: journal.bump,
    open: journal.open,
    /** Returns true when the tap lit a lamp or found something. */
    onTap(x, y) {
      if (!ctx.gl || !ctx.store.get().ignited) return false;
      return !!(hunt?.onTap(x, y) || lamps?.onTap(x, y));
    },
    onSection(section) {
      if (section?.shot === 'story3') journal.mark('story');
      if (section?.shot === 'regions') journal.mark('meanings');
    },
  };
}
