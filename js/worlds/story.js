// World II: the Ramayana homecoming, told in four chapters. Each chapter
// lights the next stretch of lamps along the pool ("the way home"); the last
// lights up the whole palace.
export function createStoryWorld(ctx) {
  const el = document.getElementById('world-story');
  const chapters = [...el.querySelectorAll('.chapter')];
  const next = document.getElementById('story-next');
  const prev = document.getElementById('story-prev');
  const progress = document.getElementById('story-progress');
  let index = 0;

  function show(i, { animate = true } = {}) {
    index = Math.max(0, Math.min(chapters.length - 1, i));
    chapters.forEach((c, k) => c.classList.toggle('is-current', k === index));
    progress.textContent = `Chapter ${index + 1} of ${chapters.length}`;
    prev.disabled = index === 0;
    next.textContent = index < chapters.length - 1 ? 'Light the next lamps' : 'Continue: what Diwali means';
    if (ctx.gl) ctx.palace.storyChapter(index);
    else ctx.fallback.setLit(0.55 + (index + 1) * 0.12);
    if (animate) ctx.audio.bell({ gain: 0.06, pitch: 1 + index * 0.06 });
  }

  next.addEventListener('click', () => {
    if (index < chapters.length - 1) {
      show(index + 1);
      chapters[index].querySelector('h3')?.setAttribute('tabindex', '-1');
      chapters[index].querySelector('h3')?.focus({ preventScroll: true });
    } else {
      ctx.go('meaning');
    }
  });
  prev.addEventListener('click', () => show(index - 1));

  return {
    id: 'story',
    el,
    heading: document.getElementById('story-title'),
    async enter() {
      await ctx.showScene('palace');
      ctx.ensureLit(false);
      if (ctx.gl) ctx.palace.setMood('none');
      ctx.setShift('panel');
      show(index, { animate: false });
    },
    exit() {},
  };
}
