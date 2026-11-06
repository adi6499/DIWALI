// Copies the few third-party files DEEPOTSAV needs out of node_modules into
// /vendor and /assets/fonts, so the site runs as plain static files with no
// bundler. Three.js add-ons import the bare specifier 'three'; we rewrite that
// to a relative path so the browser needs no import map.
//
//   npm install && npm run vendor

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = (...p) => join(root, ...p);

async function put(dest, data) {
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, data);
}

async function copy(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

// --- three.js core -----------------------------------------------------------
const threeCore = out('vendor/three/three.module.min.js');
await copy(join(nm, 'three/build/three.module.min.js'), threeCore);

const addons = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/MaskPass.js',
  'postprocessing/Pass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/SMAAPass.js',
  'shaders/SMAAShader.js',
  'shaders/CopyShader.js',
  'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js',
  'objects/Reflector.js',
  'utils/BufferGeometryUtils.js',
];

for (const file of addons) {
  const src = join(nm, 'three/examples/jsm', file);
  const dest = out('vendor/three/addons', file);
  let rel = relative(dirname(dest), threeCore).split('\\').join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  const code = (await readFile(src, 'utf8')).replace(/from\s+'three'/g, `from '${rel}'`);
  await put(dest, code);
}

// --- GSAP core (ES module; we only tween plain objects, so no CSSPlugin) ----
await copy(join(nm, 'gsap/gsap-core.js'), out('vendor/gsap/gsap-core.js'));

// --- Fonts (OFL) -------------------------------------------------------------
const fonts = [
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2', 'cormorant-500.woff2'],
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2', 'cormorant-600.woff2'],
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2', 'cormorant-500-italic.woff2'],
  ['@fontsource/mukta/files/mukta-latin-400-normal.woff2', 'mukta-400.woff2'],
  ['@fontsource/mukta/files/mukta-latin-600-normal.woff2', 'mukta-600.woff2'],
  ['@fontsource/mukta/files/mukta-latin-ext-400-normal.woff2', 'mukta-ext-400.woff2'],
  ['@fontsource/mukta/files/mukta-devanagari-400-normal.woff2', 'mukta-deva-400.woff2'],
  ['@fontsource/mukta/files/mukta-devanagari-600-normal.woff2', 'mukta-deva-600.woff2'],
];
for (const [src, name] of fonts) await copy(join(nm, src), out('assets/fonts', name));

// --- Licences ----------------------------------------------------------------
await copy(join(nm, 'three/LICENSE'), out('vendor/LICENSES/three.js-MIT.txt'));
await copy(join(nm, 'gsap/README.md'), out('vendor/LICENSES/gsap-README.md'));
for (const pkg of ['cormorant-garamond', 'mukta']) {
  await copy(join(nm, '@fontsource', pkg, 'LICENSE'), out('vendor/LICENSES', `${pkg}-OFL.txt`));
}

console.log(`Vendored three.js core + ${addons.length} add-ons, GSAP, ${fonts.length} font files.`);
