// Service worker registration, update prompt and install button.
import { toast } from './ui.js';

let deferredPrompt = null;

export function initPWA() {
  const box = document.getElementById('install-box');
  const btn = document.getElementById('install-btn');
  const text = document.getElementById('install-text');

  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (box) box.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (box) box.hidden = true;
    toast('Deepotsav is installed.');
  });

  if (isIOS && !standalone && box && text && btn) {
    // iOS has no install prompt API; explain the manual step instead.
    box.hidden = false;
    text.textContent = 'To install on iPhone or iPad: tap Share, then “Add to Home Screen”.';
    btn.hidden = true;
  }

  btn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch { /* ignore */ }
    deferredPrompt = null;
    box.hidden = true;
  });

  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const secure = location.protocol === 'https:' || local;
  if (!secure) return;
  // During local development the cache would serve stale files; opt in with ?pwa
  if (local && !/[?&]pwa\b/.test(location.search)) {
    navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }

  const run = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const offerUpdate = (worker) => {
        toast('A new version of Deepotsav is ready.', {
          timeout: 0,
          action: { label: 'Refresh', onClick: () => worker.postMessage('skip-waiting') },
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    } catch (err) {
      console.warn('[pwa] service worker registration failed', err);
    }
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
