# Deepotsav · दीपोत्सव

An immersive, mobile-first 3D Diwali experience. Light a floating terracotta
diya with a touch, and its flame wakes an ancient palace courtyard. Then walk
through seven worlds:

| # | World | What you do |
|---|-------|-------------|
| I | **The first flame** | Touch the wick: the diya lights, settles on the pool, and light spreads through the courtyard. |
| II | **The way home** | The Ramayana homecoming in four chapters; each chapter lights the next row of lamps, and the last lights the whole palace. |
| III | **What Diwali means** | Lakshmi Puja, **Dhanteras** (Dhanvantari and the King Hima legend), Jain (Mahavira's nirvana), Sikh (Bandi Chhor Divas), the five days and regional customs. Each tab changes the light and the camera. |
| IV | **Rangoli studio** | Draw with 1–16-fold symmetry in powder colours; it is laid onto the courtyard floor. Undo/redo, PNG download, keyboard drawing. |
| V | **Ocean of wishes** | Float a diya with a wish across a river of thousands of lamps. Wishes stay on your device. |
| VI | **Fireworks of light** | Tap the sky: peony, chrysanthemum, golden willow, lotus, ring, palm, crossette, anar, chakri, and a phuljhadi sparkler that writes with light. Grand finale. |
| VII | **Greetings** | Make a card in 13 greetings (including Happy Dhanteras), download it, share it, or send a personal link that opens a diya for them to light. |

Everything is procedural: there are no 3D model or texture downloads. The whole
app is about **1.9 MB** before gzip and works offline after the first visit.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm start
```

Open **http://localhost:5173**. That's it: the third-party files are already in
`vendor/`, so no install step is needed to run.

Handy switches (add to the address):

- `?2d`: preview the 2D version shown on devices without WebGL 2.
- `?pwa`: turn the offline service worker on while testing locally. It is off
  on `localhost` by default so you always see your latest edits.
- `npm start -- --host`: also serve on your Wi-Fi network to try it on a phone.
  Offline mode needs HTTPS, so it only works on a real deployment.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Local server on port 5173 (`PORT=8080 npm start` to change). |
| `npm run check` | Parses every module, checks imports, manifest, precache list and element ids. |
| `npm run release` | Rebuilds the service worker's file list and version. **Run before every deploy.** |
| `npm run icons` | Regenerates app icons and the social preview image. |
| `npm install && npm run vendor` | Re-copies three.js, GSAP and fonts from npm into `vendor/` (only when upgrading them). |

---

## Deploy

It is a plain static site: upload the folder (without `node_modules`,
`scripts` and `.claude`) to any static host. It must be served over **HTTPS**
for the service worker and native sharing.

1. `npm run release`, then `npm run check`.
2. Choose a host:
   - **Vercel**: import the GitHub repository. No build command, output
     directory = root. `vercel.json` sets the cache headers.
   - **Netlify**: drag the folder onto app.netlify.com, or connect the repo;
     publish directory = root. `_headers` sets the cache headers.
   - **GitHub Pages**: Settings → Pages → deploy from branch `main`, folder `/`.
     It works without extra configuration because every path is relative.
   - **Firebase Hosting**: `firebase init hosting` (public directory `.`,
     single-page app: no), then `firebase deploy`.
3. Open the site once online, then switch on airplane mode and reload: it
   should still work.

Caching rules (already in `vercel.json` and `_headers`): `sw.js` and HTML
must not be cached long. Everything else may be cached, because the service
worker version changes on every release.

---

## How it is built

Vanilla HTML, CSS and JavaScript ES modules, with no bundler. It uses
**three.js r170** (WebGL 2), **GSAP 3.12** (core) for choreography and the
**Web Audio API** for sound.

```
index.html              all content, semantic and readable without JavaScript
css/styles.css          design tokens, layout 320px → desktop, reduced motion
js/boot.js              tiny pre-paint script (JS class, saved motion setting)
js/main.js              bootstrap, routing between worlds, chrome, input
js/config.js            worlds, quality tiers, festival days, optional wish wall
js/core/                engine (renderer, post-processing, scene dissolve,
                        adaptive resolution), camera rig, quality probe, audio,
                        store, router, storage, accessibility helpers, PWA, UI
js/gfx/                 lampField (instanced diyas/flames/halos/reflections),
                        lighting (many-light injection), palace (procedural
                        architecture), heroDiya, water, sky, fireworks (GPU),
                        volumetrics, textures (procedural canvases), chunks (GLSL)
js/scenes/              palaceScene (shots, ignition, story, moods),
                        riverScene (lazy-loaded)
js/worlds/              one controller per world (enter/exit/pointer)
js/rangoli/             generator + studio
js/greetings/           presets, card renderer, personal links
js/fallback/            2D canvas stage for devices without WebGL 2
sw.js, manifest.webmanifest, offline.html, assets/ (icons, fonts)
vendor/                 three.js core + 12 add-ons, GSAP core, licences
scripts/                serve, release, check, icons, vendor
```

Key techniques:

- **Lamps at scale.** Every diya, flame, halo and water reflection is drawn with
  instancing, about four draw calls for 1,200–3,000 lamps. Lamps belong to
  ignition *groups*; a group's "wave" uniform sweeps past each lamp's key, so
  fire travels through the courtyard with no per-frame CPU work.
- **Many lights, cheaply.** Clusters of lamps become up to 16 virtual lights
  injected into the standard materials (`onBeforeCompile`), plus warm light
  decals on floors and walls.
- **Flames.** A noise-driven teardrop shader with a blue root and white core.
  Distant flames resolve to points so they never vanish between pixels, and
  halos become bokeh discs when out of focus.
- **Post-processing** (medium/high): HDR scene pass with depth of field and a
  golden noise dissolve between scenes, bloom, vignette and grain, then
  ACES tone mapping. A guard removes NaN pixels before bloom.
- **Water.** Analytic swell normals, Fresnel sky reflection, flame streaks laid
  on the surface, and a planar mirror on the high tier.
- **Fireworks.** Every spark's flight (gravity plus drag) is solved in the vertex
  shader, so the CPU writes each spark once. Trails are delayed copies.

### Quality, performance and accessibility

- Tiers **Low / Medium / High** chosen from the GPU, memory and screen (or set in
  Settings). They change pixel ratio, bloom, depth of field, shadows,
  reflections, lamp counts, particle budget and material cost.
- The frame-time monitor lowers resolution, then effects, if frames are slow.
  Rendering stops when the tab is hidden. The rangoli studio renders the 3D
  scene at 30 fps.
- The river, fireworks, post-processing, worlds and the studio load lazily.
- **Reduced motion** (from the system, or set in Settings): cuts instead of
  camera flights, no parallax, and softer flashes.
- Fireworks are limited to 3 launches a second, with flash brightness capped
  (photosensitive safety).
- Keyboard: every control is reachable with Tab. Page Up/Down or Alt+←/→ move
  between worlds. Tabs and option groups use arrow keys. In the rangoli
  studio, arrows move the brush, Space draws and Enter stamps.
- Screen readers: semantic sections, a live region announces changes, focus
  moves to each world's heading, and canvases have text alternatives.
- **Audio is opt-in**: nothing plays, and no AudioContext exists, until you
  press the speaker button.

### Privacy

No accounts, analytics or tracking. Rangoli designs (IndexedDB), wishes and
greeting drafts (localStorage) stay in the browser. Personal greeting links
carry the names in the URL **fragment**, which browsers never send to servers.

**Public wish wall (optional, off).** Set `WISH_ENDPOINT` in `js/config.js` to
an HTTPS endpoint, and add its origin to `connect-src` in the
Content-Security-Policy in `index.html`. The wish form then shows an
**unticked** consent box. Only wishes whose author ticks it are sent, as
`{ text, lang, created }`.

### Festival days

`FESTIVAL_DAYS` in `js/config.js` shows a greeting on the opening screen on the
visitor's local date. It currently holds 2026: Dhanteras (6 Nov), Naraka
Chaturdashi (7 Nov) and Lakshmi Puja (8 Nov). Add later years once they are
confirmed from a panchang.

---

## Feature checklist

- [x] Realistic floating terracotta diya (lathe with spout, hand-made wobble, painted band, oil, cotton wick), lit by touch, click or keyboard
- [x] Ancient palace courtyard: cusped marble arches, jaali, jharokhas, chhajjas, kanguras, chhatris, domed facade, reflecting pool, deepastambhas, garlands, akash kandils
- [x] Seven worlds with camera choreography and a golden dissolve between scenes
- [x] Flame shader and embers, bloom, shadows (gate lantern spot), reflections, depth of field and sprite bokeh, light beams, dust in the light
- [x] Respectful content: Ramayana homecoming, Lakshmi Puja, **Dhanteras and its story**, Jain, Sikh, five days, regional diversity
- [x] Rangoli studio: symmetry, mirror, 10 powder colours, powder/petal/dots/ring/eraser, undo/redo, Inspire, autosave, PNG export, courtyard view
- [x] Ocean of floating diyas: thousands of instanced lamps, private wishes, tap to read, share sheet only on your request
- [x] Interactive fireworks: 7 shells, anar, chakri, sparkler, finale, water reflections, synthesised sound
- [x] Greeting editor: 13 languages and scripts (incl. Happy Dhanteras), 4 styles, 3 accents, download, native share, personal link
- [x] Opt-in Web Audio: tanpura drone, temple bells, match strike, water, fireworks
- [x] PWA: manifest, icons (incl. maskable), service worker precache, offline page, install button, update prompt
- [x] Quality tiers, adaptive resolution, visibility pause, lazy loading, reduced motion, 2D fallback, context-loss handling
- [x] Responsive from 320px, touch-first, keyboard and screen-reader friendly

## Known limitations

- Tested in Chromium (desktop and phone-sized viewports) with every world, the
  2D fallback and the High tier. The service worker installed and stored all
  app files. **Not yet tested on real phones**, iOS Safari, Firefox, or with a
  real airplane-mode reload.
- Frame-rate figures could not be measured reliably in the test browser, so
  real-device performance should be checked. The adaptive monitor lowers
  resolution automatically if needed.
- Sound was not heard during testing (it needs a person to press play).
- The courtyard and river are stylised, procedural architecture, not
  photogrammetry.

## Licences

Code: yours. Third-party files are in `vendor/LICENSES/`: three.js (MIT),
GSAP (standard "no charge" licence), and Cormorant Garamond and Mukta (SIL Open
Font License).
