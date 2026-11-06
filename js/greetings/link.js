// Personal greeting links: the greeting is packed into the URL fragment
// (#/for/<data>). Fragments are never sent to the web server, so the names
// and message only travel with the link itself. Decoding is strict: unknown
// fields are dropped and every string is length-limited and rendered with
// textContent, never as HTML.
import { PRESETS, ACCENTS, STYLES } from './presets.js';

const LIMITS = { t: 40, f: 40, m: 220 };

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const clean = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');

export function encodeGreeting({ to, from, message, lang, style, accent }) {
  return toBase64Url(JSON.stringify({ v: 1, t: clean(to, LIMITS.t), f: clean(from, LIMITS.f), m: clean(message, LIMITS.m), l: lang, s: style, a: accent }));
}

export function decodeGreeting(payload) {
  if (!payload || payload.length > 2000) return null;
  try {
    const o = JSON.parse(fromBase64Url(payload));
    if (!o || o.v !== 1) return null;
    return {
      to: clean(o.t, LIMITS.t),
      from: clean(o.f, LIMITS.f),
      message: clean(o.m, LIMITS.m),
      lang: PRESETS.some((p) => p.id === o.l) ? o.l : 'en',
      style: STYLES.includes(o.s) ? o.s : 'courtyard',
      accent: o.a in ACCENTS ? o.a : 'gold',
    };
  } catch {
    return null;
  }
}

export function greetingUrl(g) {
  return `${location.origin}${location.pathname}#/for/${encodeGreeting(g)}`;
}
