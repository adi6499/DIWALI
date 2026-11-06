// Static checks: every JS module parses, every relative import resolves,
// the manifest is valid JSON with real icon files, every precached file
// exists, and every id the scripts look up exists in index.html.   npm run check
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = (msg) => { failures++; console.error('✗', msg); };
const ok = (msg) => console.log('✓', msg);
const exists = async (p) => !!(await stat(p).catch(() => null));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const jsFiles = await walk(join(root, 'js'));
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: await readFile(f, 'utf8'), encoding: 'utf8' });
  if (r.status !== 0) fail(`syntax: ${relative(root, f)}\n${r.stderr}`);
  const src = await readFile(f, 'utf8');
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|import\s+['"](\.[^'"]+)['"]/g)) {
    const spec = m[1] || m[2] || m[3];
    if (!(await exists(resolve(dirname(f), spec)))) fail(`import not found: ${relative(root, f)} → ${spec}`);
  }
}
ok(`${jsFiles.length} modules parsed and imports resolved`);

const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons) if (!(await exists(join(root, icon.src)))) fail(`manifest icon missing: ${icon.src}`);
ok('manifest valid');

const sw = await readFile(join(root, 'sw.js'), 'utf8');
const pre = [...sw.matchAll(/^\s+'(\.\/[^']*)',$/gm)].map((m) => m[1]).filter((p) => p !== './');
for (const p of pre) if (!(await exists(join(root, p)))) fail(`precached file missing: ${p}`);
ok(`${pre.length} precached files exist`);

const html = await readFile(join(root, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const f of jsFiles) {
  const src = await readFile(f, 'utf8');
  for (const m of src.matchAll(/getElementById\('([^']+)'\)|\$\('#([\w-]+)'\)|querySelector\('#([\w-]+)'\)/g)) {
    const id = m[1] || m[2] || m[3];
    if (!htmlIds.has(id)) fail(`${relative(root, f)} looks up #${id}, which is not in index.html`);
  }
}
ok('element ids referenced by scripts exist');

if (failures) { console.error(`\n${failures} problem(s) found`); process.exit(1); }
console.log('\nAll checks passed.');
