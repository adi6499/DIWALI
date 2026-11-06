// Translations helper.
//   node scripts/i18n.mjs source   writes scripts/i18n-source.en.json: every
//                                  English text (page + scripts) to translate
//   node scripts/i18n.mjs check    every language has every key, with the same
//                                  {placeholders} and the same inline tags
// The page text's English lives in index.html (data-i18n), the scripts' in
// js/i18n/en.js. check.mjs runs the check too.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The inner HTML of the element whose start tag ends at `from`. */
function innerOf(html, tag, from) {
  let depth = 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  throw new Error(`unclosed <${tag}>`);
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

export async function pageStrings() {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const out = new Map();
  const put = (k, v, where) => {
    if (out.has(k) && out.get(k) !== v) throw new Error(`key ${k} has two different English texts (${where})`);
    out.set(k, v);
  };
  for (const m of html.matchAll(/<(\w+)((?:\s[^>]*?)?\sdata-i18n(?:-attr)?="[^"]*"[^>]*)>/g)) {
    const [whole, tag, attrs] = m;
    const key = attr(attrs, 'data-i18n');
    if (key) {
      let v = innerOf(html, tag, m.index + whole.length).trim();
      for (const part of (attr(attrs, 'data-i18n-vars') || '').split(';')) {
        const [k, val] = part.split(':').map((s) => s?.trim());
        if (k) v = v.replace(val, `{${k}}`);
      }
      put(key, v, tag);
    }
    for (const pair of (attr(attrs, 'data-i18n-attr') || '').split(';')) {
      const [a, k] = pair.split(':').map((s) => s.trim());
      if (a && k) put(k, attr(attrs, a) ?? '', `${tag}[${a}]`);
    }
  }
  return out;
}

export async function scriptStrings() {
  const mod = await import(pathToFileURL(join(root, 'js/i18n/en.js')).href);
  return new Map(Object.entries(mod.default));
}

export async function allStrings() {
  const page = await pageStrings();
  const js = await scriptStrings();
  for (const k of js.keys()) if (page.has(k) && page.get(k) !== js.get(k)) throw new Error(`key ${k} is in both the page and en.js with different text`);
  return new Map([...page, ...js]);
}

const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<(\/?)(\w+)((?:\s+lang="[^"]*")?)[^>]*>/g)].map((m) => `${m[1]}${m[2]}${m[3]}`).sort().join(' ');

/** Problems in every translation file, as strings. */
export async function checkTranslations() {
  const en = await allStrings();
  const problems = [];
  const langs = [];
  for (const f of await readdir(join(root, 'js/i18n'))) {
    if (!/^[a-z]{2}\.js$/.test(f) || f === 'en.js') continue;
    const code = f.slice(0, 2);
    langs.push(code);
    const dict = (await import(pathToFileURL(join(root, 'js/i18n', f)).href)).default;
    for (const [k, v] of en) {
      const tv = dict[k];
      if (tv == null || tv === '') { problems.push(`${code}: missing ${k}`); continue; }
      if (holes(tv) !== holes(v)) problems.push(`${code}: ${k} has {${holes(tv)}}, English has {${holes(v)}}`);
      if (tags(tv) !== tags(v)) problems.push(`${code}: ${k} tags differ: [${tags(tv)}] vs English [${tags(v)}]`);
    }
    for (const k of Object.keys(dict)) if (!en.has(k)) problems.push(`${code}: unknown key ${k}`);
  }
  return { problems, langs, keys: en.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cmd = process.argv[2];
  if (cmd === 'source') {
    const all = await allStrings();
    const file = join(root, 'scripts/i18n-source.en.json');
    await writeFile(file, `${JSON.stringify(Object.fromEntries(all), null, 2)}\n`);
    console.log(`${all.size} English strings → scripts/i18n-source.en.json`);
  } else {
    const { problems, langs, keys } = await checkTranslations();
    for (const p of problems) console.error('✗', p);
    console.log(`${keys} keys, languages: ${langs.join(', ') || 'none yet'}; ${problems.length} problem(s)`);
    if (problems.length) process.exit(1);
  }
}
