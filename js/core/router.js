// Hash router: #/story, #/rangoli … and #/for/<payload> for personal greetings.
// The fragment never reaches a server, which is why greetings travel in it.

export function parseHash(hash, worldIds) {
  const clean = (hash || '').replace(/^#\/?/, '');
  const [head, ...rest] = clean.split('/');
  if (head === 'for' && rest.length) return { world: 'ignite', greeting: rest.join('/') };
  if (worldIds.includes(head)) return { world: head };
  return { world: worldIds[0] };
}

export function createRouter(worldIds, onRoute) {
  let current = null;

  function handle() {
    const route = parseHash(location.hash, worldIds);
    if (current && route.world === current.world && !route.greeting) return;
    current = route;
    onRoute(route);
  }

  window.addEventListener('hashchange', handle);

  return {
    start: handle,
    go(world, { replace = false } = {}) {
      const hash = `#/${world}`;
      if (location.hash === hash) return handle();
      if (replace) {
        history.replaceState(null, '', hash);
        handle();
      } else {
        location.hash = hash;
      }
    },
    get current() { return current; },
  };
}
