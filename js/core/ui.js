// Small UI helpers: toasts, dialogs, file download, clipboard.

export function toast(message, { action = null, timeout = 4200 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.onClick(); el.remove(); });
    el.append(b);
  }
  host.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

/** Open a <dialog>, returning focus to the opener on close. */
export function openDialog(dialog, opener = document.activeElement) {
  if (!dialog) return;
  const restore = () => {
    dialog.removeEventListener('close', restore);
    if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  };
  dialog.addEventListener('close', restore);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

export function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image export failed'))), type, quality);
    } else {
      try {
        const data = atob(canvas.toDataURL(type, quality).split(',')[1]);
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
        resolve(new Blob([bytes], { type }));
      } catch (err) { reject(err); }
    }
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Native share with graceful fallbacks. Returns 'shared' | 'copied' | 'cancelled' | 'unsupported'. */
export async function shareContent({ title, text, url, file }) {
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title, text, files: [file] });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
  }
  if (url || text) {
    const ok = await copyText([text, url].filter(Boolean).join('\n'));
    return ok ? 'copied' : 'unsupported';
  }
  return 'unsupported';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
