// Runs before first paint (classic, render-blocking, tiny). It switches the
// page from the no-JS "long article" layout to the app layout, and applies the
// saved motion preference early so nothing animates that shouldn't.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');
  try {
    var saved = JSON.parse(localStorage.getItem('deepotsav:settings') || '{}');
    var motion = saved.motion || 'system';
    var sysReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (motion === 'reduced' || (motion === 'system' && sysReduced)) root.classList.add('reduce-motion');
  } catch (e) { /* storage may be blocked; defaults are fine */ }
  // Browsers without ES modules get the readable article instead of a blank app.
  var s = document.createElement('script');
  if (!('noModule' in s)) { root.classList.remove('js'); root.classList.add('no-js'); }
})();
