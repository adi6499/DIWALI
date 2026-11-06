// Languages. English is written in the page itself (index.html) and, for text
// made by scripts, in en.js; every other language is one file, loaded only
// when someone picks it. Page elements carry data-i18n="key" (their inner
// HTML), data-i18n-attr="placeholder:key; aria-label:key" (attributes) and,
// for numbers inside a phrase, data-i18n-vars="n:4". Missing translations
// fall back to English, so a half-finished language never breaks the page.

import EN from './en.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { STORAGE_KEYS } from '../config.js';

export const LANGS = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'mr', name: 'मराठी', english: 'Marathi' },
  { code: 'gu', name: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil' },
  { code: 'te', name: 'తెలుగు', english: 'Telugu' },
  { code: 'kn', name: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', name: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
];

let lang = 'en';
let dict = {};
const page = new Map(); // key → English from the page
const originals = new WeakMap(); // element → { html, attrs } as first written
const listeners = new Set();

export const current = () => lang;
export const langInfo = (code = lang) => LANGS.find((l) => l.code === code) || LANGS[0];
/** A locale for dates and numbers, e.g. "hi-IN". */
export const locale = () => `${lang}-IN`;

function fill(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Text for scripts: t('wish.removed'), t('fw.launched', { name }). */
export function t(key, vars) {
  return fill(dict[key] ?? EN[key] ?? page.get(key) ?? key, vars);
}

function parseVars(el) {
  const out = {};
  for (const part of (el.dataset.i18nVars || '').split(';')) {
    const [k, v] = part.split(':').map((s) => s?.trim());
    if (k) out[k] = v;
  }
  return out;
}

function attrPairs(el) {
  return (el.dataset.i18nAttr || '').split(';').map((p) => p.split(':').map((s) => s.trim())).filter(([a, k]) => a && k);
}

/** Remember the English the page was written with (once per element). */
function capture(root) {
  for (const el of root.querySelectorAll('[data-i18n], [data-i18n-attr]')) {
    if (originals.has(el)) continue;
    const rec = { html: el.innerHTML, attrs: {} };
    if (el.dataset.i18n && !page.has(el.dataset.i18n)) {
      // store the template, with any numbers put back as {n}
      let s = el.innerHTML.trim();
      for (const [k, v] of Object.entries(parseVars(el))) s = s.replace(v, `{${k}}`);
      page.set(el.dataset.i18n, s);
    }
    for (const [a, k] of attrPairs(el)) {
      rec.attrs[a] = el.getAttribute(a) ?? '';
      if (!page.has(k)) page.set(k, rec.attrs[a]);
    }
    originals.set(el, rec);
  }
}

/** Write the current language into the page (or a part of it). */
export function apply(root = document) {
  capture(root);
  for (const el of root.querySelectorAll('[data-i18n], [data-i18n-attr]')) {
    const rec = originals.get(el);
    const key = el.dataset.i18n;
    if (key) {
      const s = dict[key];
      el.innerHTML = lang === 'en' || s == null ? rec.html : fill(s, parseVars(el));
    }
    for (const [a, k] of attrPairs(el)) {
      const s = dict[k];
      el.setAttribute(a, lang === 'en' || s == null ? rec.attrs[a] : s);
    }
  }
}

async function load(code) {
  if (code === 'en') return {};
  const mod = await import(`./${code}.js`);
  return mod.default || {};
}

/** Pick a language; the page and every listener update at once. */
export async function setLang(code, { save = true } = {}) {
  const info = langInfo(code);
  let next = {};
  try {
    next = await load(info.code);
  } catch (err) {
    console.warn('[i18n] could not load', info.code, err);
    if (info.code !== 'en') return false;
  }
  lang = info.code;
  dict = next;
  document.documentElement.lang = lang === 'en' ? 'en-IN' : lang;
  apply();
  if (save) writeJSON(STORAGE_KEYS.lang, lang);
  for (const fn of listeners) {
    try { fn(lang); } catch (err) { console.error(err); }
  }
  return true;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The saved choice, else the browser's language if we have it, else English. */
export function detect() {
  const saved = readJSON(STORAGE_KEYS.lang, null);
  if (saved && LANGS.some((l) => l.code === saved)) return saved;
  for (const tag of navigator.languages || [navigator.language || 'en']) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGS.some((l) => l.code === base)) return base;
  }
  return 'en';
}

export async function init() {
  capture(document);
  const code = detect();
  if (code !== 'en') await setLang(code, { save: false });
}
